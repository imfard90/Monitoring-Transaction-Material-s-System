'use server';

import { sql } from 'kysely';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';

export interface HasilRekonData {
    header_id: number;
    item_id: number;
    sap_out_id?: number;
    designator_id?: number;
    created_at: string | null;
    trx_id: string | null;
    sap_number: string | null;
    warehouse_name: string | null;
    nik: string | null;
    type: string | null;
    workorder: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number | null;
    isNewRekon?: boolean;
}

export interface NewHasilRekonData {
    header_id: number;
    item_id: number;
    created_at: string | null;
    trx_id: string | null;
    id_pemakaian: string | null;
    warehouse_name: string | null;
    nik: string | null;
    type: string | null;
    workorder: string | null;
    sap_number: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number | null;
}

export async function getNewHasilRekon(
    offsetMonths = 0,
    limitMonths = 5
): Promise<NewHasilRekonData[]> {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        let query = db
            .selectFrom('inventory.rekon_used_header as ruh')
            .innerJoin('inventory.rekon_used_list as rul', 'rul.rekon_used_id', 'ruh.id')
            .innerJoin('inventory.materials as m', 'm.code', 'rul.designator_id')
            .select([
                'ruh.id as header_id',
                'rul.id as item_id',
                'ruh.create_at as created_at',
                'ruh.id_trx',
                'ruh.id_pemakaian',
                'ruh.name_gudang as warehouse_name',
                'ruh.nik_teknisi',
                'ruh.wo_type',
                'ruh.wo_number',
                'rul.out_sap as sap_number',
                'm.code as material_code',
                'm.description as material_name',
                'rul.qty',
            ])
            .where('ruh.create_at', '<=', endDate)
            .where('ruh.create_at', '>', startDate)
            .orderBy('ruh.create_at', 'desc');

        if (isStaff && warehouseIds.length > 0) {
            query = query
                .innerJoin('inventory.sap_out_header as soh', 'soh.sap_number', 'rul.out_sap')
                .where('soh.warehouse_id', 'in', warehouseIds as readonly number[]);
        }

        const data = await query.limit(500).execute();

        return data.map((item) => ({
            header_id: Number(item.header_id),
            item_id: Number(item.item_id),
            created_at: item.created_at ? new Date(item.created_at).toISOString() : null,
            trx_id: String(item.id_trx),
            id_pemakaian: String(item.id_pemakaian),
            warehouse_name: String(item.warehouse_name),
            nik: String(item.nik_teknisi),
            type: String(item.wo_type),
            workorder: String(item.wo_number),
            sap_number: String(item.sap_number),
            material_code: String(item.material_code),
            material_name: String(item.material_name),
            qty: Number(item.qty),
        }));
    } catch (error) {
        actionLogger.error(
            'Error fetching new hasil rekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export async function getHasilRekon(offsetMonths = 0, limitMonths = 5): Promise<HasilRekonData[]> {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        let query = db
            .selectFrom('inventory.transaction_used_header as tuh')
            .innerJoin('inventory.transaction_used_item as tui', 'tui.used_id', 'tuh.id')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'tuh.sap_out_id')
            .innerJoin('inventory.materials as m', 'm.id', 'tui.designator_id')
            .select([
                'tuh.id as header_id',
                'tui.id as item_id',
                'soh.id as sap_out_id',
                'tui.created_at',
                'tuh.id_trx',
                'soh.sap_number',
                'tuh.name_wh as warehouse_name',
                'tuh.nik_teknisi',
                'tuh.wo_type',
                'tuh.wo_number',
                'm.code as material_code',
                'm.description as material_name',
                'm.id as designator_id',
                'tui.qty',
            ])
            .where('tui.created_at', '<=', endDate)
            .where('tui.created_at', '>', startDate)
            .orderBy('tui.created_at', 'desc');

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('soh.warehouse_id', 'in', warehouseIds as readonly number[]);
        }

        const data = await query.limit(500).execute();

        return data.map((item) => ({
            header_id: Number(item.header_id),
            item_id: Number(item.item_id),
            sap_out_id: Number(item.sap_out_id),
            designator_id: Number(item.designator_id),
            created_at: item.created_at ? new Date(item.created_at).toISOString() : null,
            trx_id: String(item.id_trx),
            sap_number: String(item.sap_number),
            warehouse_name: String(item.warehouse_name),
            nik: String(item.nik_teknisi),
            type: String(item.wo_type),
            workorder: String(item.wo_number),
            material_code: String(item.material_code),
            material_name: String(item.material_name),
            qty: Number(item.qty),
        }));
    } catch (error) {
        actionLogger.error(
            'Error fetching hasil rekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export interface GetHasilRekonPaginatedOptions {
    page?: number;
    pageSize?: number;
    search?: string;
    warehouse?: string;
    type?: string;
    material?: string;
    startDate?: string;
    endDate?: string;
}

export async function getHasilRekonPaginated(options: GetHasilRekonPaginatedOptions = {}) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const page = Math.max(1, options.page ?? 1);
        const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 20));
        const offset = (page - 1) * pageSize;

        const whereConditions: any[] = [];

        if (isStaff && warehouseIds.length > 0) {
            whereConditions.push(sql`wh_id = ANY(${warehouseIds})`);
        }

        if (options.warehouse && options.warehouse !== 'all') {
            const whList = expandWarehouseAliases(options.warehouse);
            whereConditions.push(sql`warehouse_name = ANY(${whList})`);
        }

        if (options.type && options.type !== 'all') {
            whereConditions.push(sql`type = ${options.type}`);
        }

        if (options.material && options.material !== 'all') {
            whereConditions.push(sql`material_code = ${options.material}`);
        }

        if (options.startDate) {
            const start = new Date(options.startDate);
            start.setHours(0, 0, 0, 0);
            whereConditions.push(sql`created_at >= ${start}`);
        }

        if (options.endDate) {
            const end = new Date(options.endDate);
            end.setHours(23, 59, 59, 999);
            whereConditions.push(sql`created_at <= ${end}`);
        }

        if (options.search?.trim()) {
            const s = `%${options.search.trim()}%`;
            whereConditions.push(sql`(
                trx_id ILIKE ${s} OR
                sap_number ILIKE ${s} OR
                nik ILIKE ${s} OR
                workorder ILIKE ${s}
            )`);
        }

        const whereSql =
            whereConditions.length > 0
                ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
                : sql``;

        const baseCte = sql`
            WITH combined AS (
                SELECT 
                    ruh.id as header_id,
                    rul.id as item_id,
                    null::bigint as sap_out_id,
                    null::bigint as designator_id,
                    ruh.create_at as created_at,
                    ruh.id_trx as trx_id,
                    rul.out_sap as sap_number,
                    ruh.name_gudang as warehouse_name,
                    ruh.nik_teknisi as nik,
                    ruh.wo_type::text as type,
                    ruh.wo_number as workorder,
                    m.code as material_code,
                    m.description as material_name,
                    rul.qty,
                    true as is_new_rekon,
                    soh.warehouse_id as wh_id
                FROM inventory.rekon_used_header ruh
                JOIN inventory.rekon_used_list rul ON rul.rekon_used_id = ruh.id
                JOIN inventory.materials m ON m.code = rul.designator_id
                LEFT JOIN inventory.sap_out_header soh ON soh.sap_number = rul.out_sap
                UNION ALL
                SELECT 
                    tuh.id as header_id,
                    tui.id as item_id,
                    soh.id as sap_out_id,
                    m.id as designator_id,
                    tui.created_at as created_at,
                    tuh.id_trx as trx_id,
                    soh.sap_number,
                    tuh.name_wh as warehouse_name,
                    tuh.nik_teknisi as nik,
                    tuh.wo_type::text as type,
                    tuh.wo_number as workorder,
                    m.code as material_code,
                    m.description as material_name,
                    tui.qty,
                    false as is_new_rekon,
                    soh.warehouse_id as wh_id
                FROM inventory.transaction_used_header tuh
                JOIN inventory.transaction_used_item tui ON tui.used_id = tuh.id
                JOIN inventory.sap_out_header soh ON soh.id = tuh.sap_out_id
                JOIN inventory.materials m ON m.id = tui.designator_id
            )
        `;

        const countQuery = sql<{ total: string }>`
            ${baseCte}
            SELECT count(*) as total FROM combined
            ${whereSql}
        `;
        const countRes = await countQuery.execute(db);
        const total = Number(countRes.rows[0]?.total ?? 0);

        const dataQuery = sql<HasilRekonData>`
            ${baseCte}
            SELECT 
                header_id,
                item_id,
                sap_out_id,
                designator_id,
                created_at,
                trx_id,
                sap_number,
                warehouse_name,
                nik,
                type,
                workorder,
                material_code,
                material_name,
                qty,
                is_new_rekon as "isNewRekon"
            FROM combined
            ${whereSql}
            ORDER BY created_at DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `;
        const dataRes = await dataQuery.execute(db);

        const items: HasilRekonData[] = dataRes.rows.map((r: any) => ({
            header_id: Number(r.header_id),
            item_id: Number(r.item_id),
            sap_out_id: r.sap_out_id ? Number(r.sap_out_id) : undefined,
            designator_id: r.designator_id ? Number(r.designator_id) : undefined,
            created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
            trx_id: r.trx_id ? String(r.trx_id) : null,
            sap_number: r.sap_number ? String(r.sap_number) : null,
            warehouse_name: r.warehouse_name ? String(r.warehouse_name) : null,
            nik: r.nik ? String(r.nik) : null,
            type: r.type ? String(r.type) : null,
            workorder: r.workorder ? String(r.workorder) : null,
            material_code: r.material_code ? String(r.material_code) : null,
            material_name: r.material_name ? String(r.material_name) : null,
            qty: r.qty !== null && r.qty !== undefined ? Number(r.qty) : 0,
            isNewRekon: Boolean(r.isNewRekon),
        }));

        return {
            success: true,
            data: {
                items,
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching paginated hasil rekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: 'Failed to fetch hasil rekon',
            data: {
                items: [],
                total: 0,
                page: 1,
                pageSize: 20,
                totalPages: 0,
            },
        };
    }
}

export async function getHasilRekonFilterOptions() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let whQuery = db.selectFrom('inventory.mas_wh').select('name').orderBy('name', 'asc');
        if (isStaff && warehouseIds.length > 0) {
            whQuery = whQuery.where('id', 'in', warehouseIds as number[]);
        }
        const whs = await whQuery.execute();

        const mats = await db
            .selectFrom('inventory.materials')
            .select('code')
            .orderBy('code', 'asc')
            .execute();

        return {
            warehouses: whs.map((w: any) => w.name).filter(Boolean) as string[],
            materials: mats.map((m: any) => m.code).filter(Boolean) as string[],
            types: ['psb', 'lensa', 'mt', 'ro'],
        };
    } catch (error) {
        actionLogger.error(
            'Error fetching hasil rekon filter options:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            warehouses: [],
            materials: [],
            types: ['psb', 'lensa', 'mt', 'ro'],
        };
    }
}


