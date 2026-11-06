/**
 * Hasil Rekon (reconciliation result) read operations.
 *
 * Covers the new `rekon_used_header` flow, the legacy `hasil_rekon` flow,
 * paginated listing, filter options, and export.
 */

import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '@/lib/db/database.types';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';
import type { HasilRekonItem, HasilRekonPaginatedFilter } from './types';

export const createHasilRekonRepository = (dbClient: Kysely<DB> | Transaction<DB>) => ({
    /**
     * Get New Hasil Rekon (rekon_used_header) with date range and optional warehouse scoping
     */
    getNewHasilRekon: async (params: {
        startDate: Date;
        endDate: Date;
        warehouseIds?: readonly number[];
        limit?: number;
    }) => {
        let query = dbClient
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
            .where('ruh.create_at', '<=', params.endDate)
            .where('ruh.create_at', '>', params.startDate)
            .orderBy('ruh.create_at', 'desc');

        if (params.warehouseIds !== undefined) {
            if (params.warehouseIds.length === 0) return [];
            query = query
                .innerJoin('inventory.sap_out_header as soh', 'soh.sap_number', 'rul.out_sap')
                .where('soh.warehouse_id', 'in', params.warehouseIds as readonly number[]);
        }

        const data = await query.limit(params.limit ?? 500).execute();
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
    },

    /**
     * Get Old Hasil Rekon (transaction_used_header) with date range and optional warehouse scoping
     */
    getOldHasilRekon: async (params: {
        startDate: Date;
        endDate: Date;
        warehouseIds?: readonly number[];
        limit?: number;
    }) => {
        let query = dbClient
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
            .where('tui.created_at', '<=', params.endDate)
            .where('tui.created_at', '>', params.startDate)
            .orderBy('tui.created_at', 'desc');

        if (params.warehouseIds !== undefined) {
            if (params.warehouseIds.length === 0) return [];
            query = query.where('soh.warehouse_id', 'in', params.warehouseIds as readonly number[]);
        }

        const data = await query.limit(params.limit ?? 500).execute();
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
    },

    /**
     * Get paginated hasil rekon combining new and old transactions via SQL CTE
     */
    getHasilRekonPaginated: async (options: HasilRekonPaginatedFilter) => {
        const page = Math.max(1, options.page ?? 1);
        const pageSize = Math.min(100, Math.max(10, options.pageSize ?? 20));
        const offset = (page - 1) * pageSize;

        const whereConditions: ReturnType<typeof sql>[] = [];

        if (options.warehouseIds !== undefined) {
            if (options.warehouseIds.length === 0) {
                return {
                    items: [],
                    total: 0,
                    page,
                    pageSize,
                    totalPages: 0,
                };
            }
            whereConditions.push(sql`wh_id = ANY(${options.warehouseIds})`);
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
        const countRes = await countQuery.execute(dbClient);
        const total = Number(countRes.rows[0]?.total ?? 0);

        const dataQuery = sql<Record<string, unknown>>`
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
        const dataRes = await dataQuery.execute(dbClient);

        const items: HasilRekonItem[] = dataRes.rows.map((r) => ({
            header_id: Number(r.header_id),
            item_id: Number(r.item_id),
            sap_out_id: r.sap_out_id ? Number(r.sap_out_id) : undefined,
            designator_id: r.designator_id ? Number(r.designator_id) : undefined,
            created_at: r.created_at
                ? new Date(r.created_at as string | number | Date).toISOString()
                : null,
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
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    },

    /**
     * Get distinct filter options for hasil rekon (warehouses, materials, types)
     */
    getHasilRekonFilterOptions: async (warehouseIds?: readonly number[]) => {
        let whQuery = dbClient
            .selectFrom('inventory.rekon_used_header as ruh')
            .select('ruh.name_gudang as name')
            .distinct()
            .orderBy('ruh.name_gudang', 'asc');

        if (warehouseIds !== undefined) {
            if (warehouseIds.length === 0) {
                return { warehouses: [], materials: [], types: ['psb', 'lensa', 'mt', 'ro'] };
            }
            whQuery = whQuery
                .innerJoin('inventory.rekon_used_list as rul', 'rul.rekon_used_id', 'ruh.id')
                .innerJoin('inventory.sap_out_header as soh', 'soh.sap_number', 'rul.out_sap')
                .where('soh.warehouse_id', 'in', warehouseIds as number[]);
        }
        const whs = await whQuery.execute();
        const warehouses = Array.from(new Set(whs.map((w) => w.name).filter(Boolean))) as string[];

        const mats = await dbClient
            .selectFrom('inventory.materials')
            .select('code')
            .orderBy('code', 'asc')
            .execute();

        return {
            warehouses,
            materials: mats.map((m) => m.code).filter(Boolean) as string[],
            types: ['psb', 'lensa', 'mt', 'ro'],
        };
    },

    /**
     * Get hasil rekon records for monthly export
     */
    getHasilRekonExport: async (params: {
        startDate: Date;
        endDate: Date;
        warehouseIds?: readonly number[];
        orderDirection?: 'asc' | 'desc';
    }) => {
        const orderDir = params.orderDirection === 'desc' ? sql`DESC` : sql`ASC`;
        const whereConditions: ReturnType<typeof sql>[] = [
            sql`created_at >= ${params.startDate}`,
            sql`created_at <= ${params.endDate}`,
        ];

        if (params.warehouseIds !== undefined) {
            if (params.warehouseIds.length === 0) return [];
            whereConditions.push(sql`wh_id = ANY(${params.warehouseIds})`);
        }

        const whereSql = sql`WHERE ${sql.join(whereConditions, sql` AND `)}`;

        const baseCte = sql`
            WITH combined AS (
                SELECT 
                    ruh.id as header_id,
                    rul.id as item_id,
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
                    soh.warehouse_id as wh_id
                FROM inventory.rekon_used_header ruh
                JOIN inventory.rekon_used_list rul ON rul.rekon_used_id = ruh.id
                JOIN inventory.materials m ON m.code = rul.designator_id
                LEFT JOIN inventory.sap_out_header soh ON soh.sap_number = rul.out_sap
                UNION ALL
                SELECT 
                    tuh.id as header_id,
                    tui.id as item_id,
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
                    soh.warehouse_id as wh_id
                FROM inventory.transaction_used_header tuh
                JOIN inventory.transaction_used_item tui ON tui.used_id = tuh.id
                JOIN inventory.sap_out_header soh ON soh.id = tuh.sap_out_id
                JOIN inventory.materials m ON m.id = tui.designator_id
            )
        `;

        const query = sql<{
            created_at: Date | string | null;
            trx_id: string | null;
            sap_number: string | null;
            warehouse_name: string | null;
            nik: string | null;
            type: string | null;
            workorder: string | null;
            material_code: string | null;
            material_name: string | null;
            qty: number | null;
        }>`
            ${baseCte}
            SELECT 
                created_at,
                trx_id,
                sap_number,
                warehouse_name,
                nik,
                type,
                workorder,
                material_code,
                material_name,
                qty
            FROM combined
            ${whereSql}
            ORDER BY created_at ${orderDir}
        `;

        const res = await query.execute(dbClient);
        return res.rows.map((row) => ({
            created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
            trx_id: row.trx_id ? String(row.trx_id) : null,
            sap_number: row.sap_number ? String(row.sap_number) : null,
            warehouse_name: row.warehouse_name ? String(row.warehouse_name) : null,
            nik: row.nik ? String(row.nik) : null,
            type: row.type ? String(row.type) : null,
            workorder: row.workorder ? String(row.workorder) : null,
            material_code: row.material_code ? String(row.material_code) : null,
            material_name: row.material_name ? String(row.material_name) : null,
            qty: row.qty !== null && row.qty !== undefined ? Number(row.qty) : 0,
        }));
    },
});

export type HasilRekonRepository = ReturnType<typeof createHasilRekonRepository>;
