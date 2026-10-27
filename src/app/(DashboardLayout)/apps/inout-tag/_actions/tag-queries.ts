'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { warehouseScope } from '@/lib/policies';
import type { InOutTagRow } from '@/lib/types/inventory';

export async function getInOutTags(offsetMonths = 0, limitMonths = 5) {
    try {
        const user = await getSessionUser();
        const scopedWarehouseIds = warehouseScope(user, 'when-assigned');

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        let inoutQuery = db
            .selectFrom('inventory.inout_tag_header as h')
            .leftJoin('inventory.vendor_tracking as v', 'v.header_id', 'h.id')
            .leftJoin('inventory.mas_wh as wh_from', 'wh_from.id', 'h.from_wh_id')
            .leftJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'h.to_wh_id')
            .leftJoin('auth.user as u_create', 'u_create.nik', 'h.created_by')
            .leftJoin('auth.user as u_send', 'u_send.nik', 'h.nik_send')
            .leftJoin('auth.user as u_accept', 'u_accept.nik', 'h.nik_accept')
            .selectAll('h')
            .select([
                'v.name_vendor',
                'wh_from.name as from_wh_name',
                'wh_to.name as to_wh_name',
                'u_create.name as created_by_name',
                'u_send.name as send_by_name',
                'u_accept.name as accept_by_name',
            ])
            .where('h.request_time', '<=', endDate)
            .where('h.request_time', '>', startDate);

        if (scopedWarehouseIds) {
            inoutQuery = inoutQuery.where((eb) =>
                eb.or([
                    eb('h.from_wh_id', 'in', scopedWarehouseIds),
                    eb('h.to_wh_id', 'in', scopedWarehouseIds),
                ])
            );
        }

        const inoutHeaders = await inoutQuery
            .orderBy('h.request_time', 'desc')
            .limit(500)
            .execute();

        let returnQuery = db
            .selectFrom('inventory.return_material_header as r')
            .innerJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'r.warehouse_id')
            .innerJoin('hr.technicians as t', 't.nik', 'r.nik_teknisi')
            .leftJoin('auth.user as u_ret_accept', 'u_ret_accept.nik', 'r.nik_accept')
            .select([
                'r.id',
                'r.id_trx',
                'r.accept_id',
                'r.nik_accept',
                'r.created_by',
                'r.notes',
                'r.end_status',
                'r.created_at as request_time',
                'r.accept_time',
                'r.warehouse_id as to_wh_id',
                't.name as from_wh_name',
                't.name as created_by_name',
                'u_ret_accept.name as accept_by_name',
                'wh_to.name as to_wh_name',
            ])
            .where('r.created_at', '<=', endDate)
            .where('r.created_at', '>', startDate);

        if (scopedWarehouseIds) {
            returnQuery = returnQuery.where('r.warehouse_id', 'in', scopedWarehouseIds.map(String));
        }

        const returnHeaders = await returnQuery
            .orderBy('r.created_at', 'desc')
            .limit(500)
            .execute();

        // Merge and format
        const allTags: InOutTagRow[] = [
            ...inoutHeaders.map((h) => ({
                ...h,
                from_wh_id: Number(h.from_wh_id) || null,
                to_wh_id: Number(h.to_wh_id) || null,
                type: 'inout' as const,
            })),
            ...returnHeaders.map((r) => ({
                id: r.id,
                id_trx: r.id_trx,
                request_id: null,
                send_id: null,
                nik_send: null,
                send_by_name: null,
                send_time: null,
                accept_id: r.accept_id,
                nik_accept: r.nik_accept,
                accept_by_name: r.accept_by_name,
                accept_time: r.accept_time,
                created_by: r.created_by || r.from_wh_name,
                created_by_name: r.created_by_name,
                notes: r.notes,
                end_status:
                    r.end_status === 'pending' || r.end_status === 'wait_approve'
                        ? 'requested'
                        : r.end_status === 'accepted'
                          ? 'closed'
                          : r.end_status,
                request_time: r.request_time,
                name_vendor: null,
                from_wh_name: `Technician: ${r.from_wh_name}`,
                to_wh_name: r.to_wh_name,
                from_wh_id: null,
                to_wh_id: Number(r.to_wh_id) || null,
                type: 'return' as const,
            })),
        ];

        // Sort by time desc
        allTags.sort((a, b) => {
            const timeA = a.request_time ? new Date(a.request_time).getTime() : 0;
            const timeB = b.request_time ? new Date(b.request_time).getTime() : 0;
            return timeB - timeA;
        });

        // Group by status for the cards
        const counts = {
            requested: 0,
            in_transit: 0,
            closed: 0,
            cancel: 0,
        };

        allTags.forEach((h) => {
            if (h.end_status === 'requested') counts.requested++;
            else if (h.end_status === 'in_transit') counts.in_transit++;
            else if (h.end_status === 'closed') counts.closed++;
            else if (h.end_status === 'cancel') counts.cancel++;
        });

        return { success: true, data: allTags, counts };
    } catch (error) {
        actionLogger.error(
            'Error fetching tags:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: [],
            counts: { requested: 0, in_transit: 0, closed: 0, cancel: 0 },
        };
    }
}

export interface GetInOutTagsPaginatedOptions {
    page?: number;
    pageSize?: number;
    status?: string;
    warehouse?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
}

export async function getInOutTagsPaginated(options: GetInOutTagsPaginatedOptions = {}) {
    try {
        const user = await getSessionUser();
        const scopedWarehouseIds = warehouseScope(user, 'when-assigned');
        const page = Math.max(1, options.page ?? 1);
        const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 20));
        const offset = (page - 1) * pageSize;

        const baseCte = sql`
            WITH combined AS (
                SELECT 
                    h.id,
                    h.id_trx,
                    h.request_id,
                    h.send_id,
                    h.nik_send,
                    u_send.name as send_by_name,
                    h.send_time,
                    h.accept_id,
                    h.nik_accept,
                    u_accept.name as accept_by_name,
                    h.accept_time,
                    h.created_by,
                    u_create.name as created_by_name,
                    h.notes,
                    h.end_status::text as end_status,
                    h.request_time,
                    v.name_vendor,
                    wh_from.name as from_wh_name,
                    wh_to.name as to_wh_name,
                    'inout' as type,
                    h.from_wh_id as wh_from_id,
                    h.to_wh_id as wh_to_id
                FROM inventory.inout_tag_header h
                LEFT JOIN inventory.vendor_tracking v ON v.header_id = h.id
                LEFT JOIN inventory.mas_wh wh_from ON wh_from.id = h.from_wh_id
                LEFT JOIN inventory.mas_wh wh_to ON wh_to.id = h.to_wh_id
                LEFT JOIN auth.user u_create ON u_create.nik = h.created_by
                LEFT JOIN auth.user u_send ON u_send.nik = h.nik_send
                LEFT JOIN auth.user u_accept ON u_accept.nik = h.nik_accept
                UNION ALL
                SELECT 
                    r.id,
                    r.id_trx,
                    null as request_id,
                    null as send_id,
                    null as nik_send,
                    null as send_by_name,
                    null::timestamptz as send_time,
                    r.accept_id,
                    r.nik_accept,
                    u_ret_accept.name as accept_by_name,
                    r.accept_time,
                    r.created_by,
                    t.name as created_by_name,
                    r.notes,
                    CASE 
                        WHEN r.end_status IN ('pending', 'wait_approve') THEN 'requested'
                        WHEN r.end_status = 'accepted' THEN 'closed'
                        ELSE r.end_status
                    END::text as end_status,
                    r.created_at as request_time,
                    null as name_vendor,
                    ('Technician: ' || t.name) as from_wh_name,
                    wh_to.name as to_wh_name,
                    'return' as type,
                    null::bigint as wh_from_id,
                    wh_to.id as wh_to_id
                FROM inventory.return_material_header r
                INNER JOIN inventory.mas_wh wh_to ON wh_to.id = r.warehouse_id
                INNER JOIN hr.technicians t ON t.nik = r.nik_teknisi
                LEFT JOIN auth.user u_ret_accept ON u_ret_accept.nik = r.nik_accept
            )
        `;

        const staffWhere = scopedWarehouseIds
            ? sql`WHERE (wh_from_id = ANY(${scopedWarehouseIds}) OR wh_to_id = ANY(${scopedWarehouseIds}))`
            : sql``;

        const countsQuery = sql<{
            requested: string;
            in_transit: string;
            closed: string;
            cancel: string;
        }>`
            ${baseCte}
            SELECT 
                count(*) filter (where end_status = 'requested') as requested,
                count(*) filter (where end_status = 'in_transit') as in_transit,
                count(*) filter (where end_status = 'closed') as closed,
                count(*) filter (where end_status = 'cancel') as cancel
            FROM combined
            ${staffWhere}
        `;
        const countsRes = await countsQuery.execute(db);
        const counts = {
            requested: Number(countsRes.rows[0]?.requested ?? 0),
            in_transit: Number(countsRes.rows[0]?.in_transit ?? 0),
            closed: Number(countsRes.rows[0]?.closed ?? 0),
            cancel: Number(countsRes.rows[0]?.cancel ?? 0),
        };

        const conditions: ReturnType<typeof sql>[] = [];
        if (scopedWarehouseIds) {
            conditions.push(
                sql`(wh_from_id = ANY(${scopedWarehouseIds}) OR wh_to_id = ANY(${scopedWarehouseIds}))`
            );
        }

        if (options.status && options.status !== 'all') {
            conditions.push(sql`end_status = ${options.status}`);
        }

        if (options.warehouse && options.warehouse !== 'all') {
            conditions.push(sql`to_wh_name = ${options.warehouse}`);
        }

        if (options.startDate) {
            const start = new Date(options.startDate);
            start.setHours(0, 0, 0, 0);
            conditions.push(sql`request_time >= ${start}`);
        }

        if (options.endDate) {
            const end = new Date(options.endDate);
            end.setHours(23, 59, 59, 999);
            conditions.push(sql`request_time <= ${end}`);
        }

        if (options.search?.trim()) {
            const s = `%${options.search.trim()}%`;
            conditions.push(sql`(
                request_id ILIKE ${s} OR
                send_id ILIKE ${s} OR
                accept_id ILIKE ${s} OR
                id_trx ILIKE ${s}
            )`);
        }

        const filterWhere =
            conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

        const countQuery = sql<{ total: string }>`
            ${baseCte}
            SELECT count(*) as total FROM combined
            ${filterWhere}
        `;
        const countRes = await countQuery.execute(db);
        const total = Number(countRes.rows[0]?.total ?? 0);

        const dataQuery = sql<InOutTagRow>`
            ${baseCte}
            SELECT 
                id,
                id_trx,
                request_id,
                send_id,
                nik_send,
                send_by_name,
                send_time,
                accept_id,
                nik_accept,
                accept_by_name,
                accept_time,
                created_by,
                created_by_name,
                notes,
                end_status,
                request_time,
                name_vendor,
                from_wh_name,
                to_wh_name,
                type,
                wh_from_id as from_wh_id,
                wh_to_id as to_wh_id
            FROM combined
            ${filterWhere}
            ORDER BY request_time DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `;
        const dataRes = await dataQuery.execute(db);

        const tags = dataRes.rows.map((row) => ({
            ...row,
            from_wh_id: row.from_wh_id ? Number(row.from_wh_id) : null,
            to_wh_id: row.to_wh_id ? Number(row.to_wh_id) : null,
        }));

        return {
            success: true,
            data: {
                tags,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
                counts,
            },
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching paginated tags:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Failed to fetch tags',
            data: {
                tags: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
                counts: { requested: 0, in_transit: 0, closed: 0, cancel: 0 },
            },
        };
    }
}
