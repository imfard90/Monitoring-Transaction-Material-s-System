'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import type { InOutTagRow } from '@/lib/types/inventory';

export async function getInOutTags(offsetMonths = 0, limitMonths = 5) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const applyWhFilter = isStaff && warehouseIds.length > 0;

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        let inoutQuery = db
            .selectFrom('inventory.inout_tag_header as h')
            .leftJoin('inventory.vendor_tracking as v', 'v.header_id', 'h.id')
            .leftJoin('inventory.mas_wh as wh_from', 'wh_from.id', 'h.from_wh_id')
            .leftJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'h.to_wh_id')
            .selectAll('h')
            .select(['v.name_vendor', 'wh_from.name as from_wh_name', 'wh_to.name as to_wh_name'])
            .where('h.request_time', '<=', endDate)
            .where('h.request_time', '>', startDate);

        if (applyWhFilter) {
            inoutQuery = inoutQuery.where((eb) =>
                eb.or([
                    eb('h.from_wh_id', 'in', warehouseIds),
                    eb('h.to_wh_id', 'in', warehouseIds),
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
            .select([
                'r.id',
                'r.id_trx',
                'r.accept_id',
                'r.end_status',
                'r.created_at as request_time',
                'r.warehouse_id as to_wh_id',
                't.name as from_wh_name',
                'wh_to.name as to_wh_name',
            ])
            .where('r.created_at', '<=', endDate)
            .where('r.created_at', '>', startDate);

        if (applyWhFilter) {
            returnQuery = returnQuery.where('r.warehouse_id', 'in', warehouseIds.map(String));
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
                accept_id: r.accept_id,
                end_status:
                    r.end_status === 'pending'
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


export async function getInOutTagItems(headerId: number, type?: string) {
    try {
        let items: any[];
        if (type === 'return') {
            items = await db
                .selectFrom('inventory.return_material_items as i')
                .leftJoin('inventory.materials as m', 'm.id', 'i.designator_id')
                .select([
                    'i.id',
                    'i.qty',
                    'm.code as designator_code',
                    'm.description as material_description',
                ])
                .where('i.header_id', '=', String(headerId))
                .execute();

            // Map to match InOutTagItem structure
            items = items.map((item) => ({
                ...item,
                action: 'request' as const, // Return material items are considered 'request' in this context
            }));
        } else {
            const rawItems = await db
                .selectFrom('inventory.inout_tag_items as i')
                .leftJoin('inventory.materials as m', 'm.id', 'i.designator_id')
                .select([
                    'i.id',
                    'i.action',
                    'i.qty',
                    'm.code as designator_code',
                    'm.description as material_description',
                ])
                .where('i.header_id', '=', String(headerId))
                .execute();

            items = rawItems.map((item) => ({
                ...item,
                action: item.action as 'request' | 'send' | 'accept',
            }));
        }

        return { success: true, data: items };
    } catch (error) {
        actionLogger.error(
            'Error fetching tag items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}


export async function getWarehouses() {
    try {
        const whs = await db.selectFrom('inventory.mas_wh').selectAll().execute();
        return { success: true, data: whs };
    } catch (error) {
        actionLogger.error(
            'Error fetching warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}


export async function getMaterials() {
    try {
        const mats = await db.selectFrom('inventory.materials').selectAll().execute();
        return { success: true, data: mats };
    } catch (error) {
        actionLogger.error(
            'Error fetching materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}


export async function getMaterialsWithStock(fromWhId?: number | null) {
    try {
        // If no WH selected, or vendor, return all materials with stock ~
        let checkStock = false;

        if (fromWhId) {
            const wh = await db
                .selectFrom('inventory.mas_wh')
                .select('check_stock')
                .where('id', '=', Number(fromWhId))
                .executeTakeFirst();
            if (wh?.check_stock) {
                checkStock = true;
            }
        }

        if (checkStock) {
            // Check stock
            const mats = await db
                .selectFrom('inventory.materials as m')
                .innerJoin('inventory.stock_balance as sb', 'sb.designator_id', 'm.id')
                .selectAll('m')
                .select('sb.qty_stock')
                .where('sb.warehouse_id', '=', Number(fromWhId))
                .where('sb.qty_stock', '>', 0)
                .execute();

            return { success: true, data: mats };
        } else {
            const mats = await db.selectFrom('inventory.materials').selectAll().execute();
            const data = mats.map((m) => ({ ...m, qty_stock: '~' }));
            return { success: true, data };
        }
    } catch (error) {
        actionLogger.error(
            'Error fetching materials with stock:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}


export async function getInoutTagItemsByHeaderId(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.inout_tag_items as items')
            .innerJoin('inventory.materials as mat', 'items.designator_id', 'mat.id')
            .select([
                'items.id',
                'items.header_id',
                'items.action',
                'items.action_id',
                'items.designator_id',
                'items.qty',
                'mat.code as material_code',
                'mat.description as material_description',
                'mat.unit as material_unit',
            ])
            .where('items.header_id', '=', String(headerId))
            .execute();

        return { success: true, data: items };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch tag items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}


export async function getReturnMaterialItemsByHeaderId(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.return_material_items as ri')
            .innerJoin('inventory.materials as m', 'm.id', 'ri.designator_id')
            .select([
                'ri.id',
                'ri.designator_id',
                'ri.qty',
                'm.code as material_code',
                'm.description as material_description',
                'm.unit as material_unit',
            ])
            .where('ri.header_id', '=', String(headerId))
            .execute();

        return { success: true, data: items };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch return material items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: [],
            error: error instanceof Error ? error.message : 'Unknown error',
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
        const { isStaff, warehouseIds } = await getSessionUser();
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
                    h.accept_id,
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
                UNION ALL
                SELECT 
                    r.id,
                    r.id_trx,
                    null as request_id,
                    null as send_id,
                    r.accept_id,
                    CASE 
                        WHEN r.end_status = 'pending' THEN 'requested'
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
            )
        `;

        const staffWhere =
            isStaff && warehouseIds.length > 0
                ? sql`WHERE (wh_from_id = ANY(${warehouseIds}) OR wh_to_id = ANY(${warehouseIds}))`
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

        const conditions: any[] = [];
        if (isStaff && warehouseIds.length > 0) {
            conditions.push(
                sql`(wh_from_id = ANY(${warehouseIds}) OR wh_to_id = ANY(${warehouseIds}))`
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
                accept_id,
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

export async function getInOutTagFilterOptions() {
    try {
        const whs = await db.selectFrom('inventory.mas_wh').select('name').orderBy('name', 'asc').execute();
        return {
            toWhOptions: whs.map((w: any) => w.name).filter(Boolean) as string[],
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching inout tag filter options:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { toWhOptions: [] };
    }
}
