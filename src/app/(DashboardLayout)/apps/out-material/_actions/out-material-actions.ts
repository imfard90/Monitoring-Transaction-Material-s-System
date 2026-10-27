'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import type { OutMaterialRow } from '@/lib/types/inventory';

const getOutMaterialsSchema = z.object({
    offsetMonths: z.number().int().min(0).default(0),
    limitMonths: z.number().int().min(1).max(12).default(5),
});

export async function getOutMaterials(offsetMonths = 0, limitMonths = 5) {
    const parsed = getOutMaterialsSchema.safeParse({ offsetMonths, limitMonths });
    if (!parsed.success) {
        actionLogger.warn('Invalid parameters for getOutMaterials', {
            issues: parsed.error.issues,
        });
        return {
            success: false,
            data: [],
            counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
        };
    }
    const { offsetMonths: validOffset, limitMonths: validLimit } = parsed.data;

    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - validOffset);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (validOffset + validLimit));

        let query = db
            .selectFrom('inventory.sap_out_header as h')
            .leftJoin('hr.technicians as t', 't.nik', 'h.nik_teknisi')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'h.warehouse_id')
            .selectAll('h')
            .select(['t.name as nama_teknisi', 'wh.name as nama_gudang'])
            .where('h.request_time', '<=', endDate)
            .where('h.request_time', '>', startDate)
            .orderBy('h.request_time', 'desc');

        if (isStaff) {
            if (warehouseIds.length === 0) {
                return {
                    success: true,
                    data: [],
                    counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
                };
            }
            query = query.where('h.warehouse_id', 'in', warehouseIds as number[]);
        }

        const headers = await query.execute();

        const counts = {
            wait_approve: 0,
            request: 0,
            intech: 0,
            close: 0,
        };

        headers.forEach((h) => {
            const status = h.end_status as string;
            if (status === 'wait_approve') counts.wait_approve++;
            else if (status === 'request') counts.request++;
            else if (status === 'intech') counts.intech++;
            else if (status === 'close') counts.close++;
        });

        return { success: true, data: headers as unknown as OutMaterialRow[], counts };
    } catch (error) {
        actionLogger.error(
            'Error fetching out materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            data: [],
            counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
        };
    }
}

export interface GetOutMaterialsPaginatedOptions {
    page?: number;
    pageSize?: number;
    status?: string;
    warehouse?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
}

export async function getOutMaterialsPaginated(options: GetOutMaterialsPaginatedOptions = {}) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const page = Math.max(1, options.page ?? 1);
        const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 20));
        const offset = (page - 1) * pageSize;

        // Base query for counts by status
        let baseCountQuery = db.selectFrom('inventory.sap_out_header as h');
        let listQuery = db
            .selectFrom('inventory.sap_out_header as h')
            .leftJoin('hr.technicians as t', 't.nik', 'h.nik_teknisi')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'h.warehouse_id');

        if (isStaff) {
            if (warehouseIds.length === 0) {
                return {
                    success: true,
                    data: {
                        headers: [],
                        total: 0,
                        page,
                        pageSize,
                        totalPages: 0,
                        counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
                    },
                };
            }
            baseCountQuery = baseCountQuery.where('h.warehouse_id', 'in', warehouseIds as number[]);
            listQuery = listQuery.where('h.warehouse_id', 'in', warehouseIds as number[]);
        }

        const countsRes = await baseCountQuery
            .select([
                sql<number>`count(*) filter (where h.end_status = 'wait_approve')`.as(
                    'wait_approve'
                ),
                sql<number>`count(*) filter (where h.end_status = 'request')`.as('request'),
                sql<number>`count(*) filter (where h.end_status = 'intech')`.as('intech'),
                sql<number>`count(*) filter (where h.end_status = 'close')`.as('close'),
            ])
            .executeTakeFirst();

        const counts = {
            wait_approve: Number(countsRes?.wait_approve ?? 0),
            request: Number(countsRes?.request ?? 0),
            intech: Number(countsRes?.intech ?? 0),
            close: Number(countsRes?.close ?? 0),
        };

        if (options.status && options.status !== 'all') {
            listQuery = listQuery.where(sql<boolean>`h.end_status::text = ${options.status}`);
        }

        if (options.warehouse && options.warehouse !== 'all') {
            listQuery = listQuery.where('wh.name', '=', options.warehouse);
        }

        if (options.startDate) {
            const start = new Date(options.startDate);
            start.setHours(0, 0, 0, 0);
            listQuery = listQuery.where('h.request_time', '>=', start);
        }

        if (options.endDate) {
            const end = new Date(options.endDate);
            end.setHours(23, 59, 59, 999);
            listQuery = listQuery.where('h.request_time', '<=', end);
        }

        if (options.search?.trim()) {
            const s = `%${options.search.trim()}%`;
            listQuery = listQuery.where((eb) =>
                eb.or([
                    eb('h.request_id', 'ilike', s),
                    eb('h.id_reservasi', 'ilike', s),
                    eb('h.sap_number', 'ilike', s),
                    eb('h.nik_teknisi', 'ilike', s),
                    eb('t.name', 'ilike', s),
                ])
            );
        }

        const countRes = await listQuery
            .select((eb) => eb.fn.count('h.id').as('total'))
            .executeTakeFirst();
        const total = Number(countRes?.total ?? 0);

        const rows = await listQuery
            .selectAll('h')
            .select(['t.name as nama_teknisi', 'wh.name as nama_gudang'])
            .orderBy('h.request_time', 'desc')
            .limit(pageSize)
            .offset(offset)
            .execute();

        return {
            success: true,
            data: {
                headers: rows as unknown as OutMaterialRow[],
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
                counts,
            },
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching paginated out materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Failed to fetch out materials',
            data: {
                headers: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
                counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
            },
        };
    }
}

export async function getOutMaterialFilterOptions() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whQuery = db
            .selectFrom('inventory.sap_out_header as h')
            .innerJoin('inventory.mas_wh as wh', 'wh.id', 'h.warehouse_id')
            .select('wh.name')
            .distinct()
            .orderBy('wh.name', 'asc');
        if (isStaff) {
            whQuery = whQuery.where('h.warehouse_id', 'in', warehouseIds as number[]);
        }
        const whs = await whQuery.execute();
        const warehouses = Array.from(new Set(whs.map((w) => w.name).filter(Boolean))) as string[];

        return {
            warehouses,
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching out material filter options:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { warehouses: [] };
    }
}

const getOutMaterialItemsSchema = z.object({
    headerId: z.number().int().positive(),
});

export async function getOutMaterialItems(headerId: number) {
    const parsed = getOutMaterialItemsSchema.safeParse({ headerId });
    if (!parsed.success) {
        actionLogger.warn('Invalid headerId for getOutMaterialItems', {
            issues: parsed.error.issues,
        });
        return { success: false, data: [] };
    }

    try {
        const items = await db
            .selectFrom('inventory.sap_out_items as i')
            .leftJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .select([
                'i.id',
                'i.qty_req',
                'i.qty_used',
                'm.code as designator_code',
                'm.description as material_description',
            ])
            .where('i.header_id', '=', String(headerId))
            .execute();

        return { success: true, data: items };
    } catch (error) {
        actionLogger.error(
            'Error fetching out material items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}
