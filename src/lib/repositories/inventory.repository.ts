/**
 * Inventory Repository - Stored procedure wrappers
 * Priority: Use stored procedures for atomicity and data integrity
 * All critical operations go through stored procedures in inventory schema
 */

import { type Kysely, sql, type Transaction } from 'kysely';
import type { DB } from '@/lib/db/database.types';
import { db } from '@/lib/db/db';
import { expandWarehouseAliases } from '@/lib/warehouse-helper';

export interface HasilRekonItem {
    header_id: number;
    item_id: number;
    sap_out_id?: number;
    designator_id?: number;
    created_at: string | null;
    trx_id: string | null;
    id_pemakaian?: string | null;
    sap_number: string | null;
    warehouse_name: string | null;
    nik: string | null;
    type: string | null;
    workorder: string | null;
    material_code: string | null;
    material_name: string | null;
    qty: number;
    isNewRekon?: boolean;
}

export interface HasilRekonPaginatedFilter {
    page?: number;
    pageSize?: number;
    search?: string;
    warehouse?: string;
    type?: string;
    material?: string;
    startDate?: string;
    endDate?: string;
    warehouseIds?: readonly number[];
}

export type InOutTagFilters = {
    status?: 'OPEN' | 'IN_TRANSIT' | 'CLOSED' | 'CANCEL';
    fromWarehouseId?: number;
    toWarehouseId?: number;
    fromDate?: Date;
    toDate?: Date;
    search?: string;
    limit?: number;
    offset?: number;
};

/**
 * Repository provides high-level data access methods
 * Critical operations use stored procedures for atomicity
 * Read operations use Kysely query builder for type safety
 */
export const createInventoryRepository = (dbClient: Kysely<DB> | Transaction<DB>) => ({
    // ==================== Stored Procedure Wrappers (Priority) ====================

    /**
     * Create InOut Tag - atomic operation
     * Signature matches inventory.sp_create_inout_tag (migration 047)
     */
    createInOutTag: async (params: {
        fromWhId: number | null;
        toWhId: number | null;
        requestId?: string | null;
        vendorName?: string | null;
        cost: number;
        items: Array<{
            designator_id: number;
            qty: number;
            action?: string;
            action_id?: string;
        }>;
        createdBy?: string | null;
    }) => {
        const res = await sql<{ p_id_trx: string }>`
            CALL inventory.sp_create_inout_tag(
                ${params.fromWhId ? params.fromWhId : null}::bigint,
                ${params.toWhId ? params.toWhId : null}::bigint,
                ${params.requestId || null},
                ${params.vendorName || null},
                ${params.cost},
                ${JSON.stringify(params.items)}::jsonb,
                null,
                ${params.createdBy || null}::varchar
            )
        `.execute(dbClient);
        return res.rows[0]?.p_id_trx;
    },

    /**
     * Update InOut Tag (request/send/accept) - atomic operation
     * Signature matches inventory.sp_update_inout_tag (migration 047)
     * SP accepts 5 params: p_header_id, p_action, p_action_id, p_items_json, p_user_nik
     */
    updateInOutTag: (params: {
        headerId: number;
        actionType: 'request' | 'send' | 'accept';
        actionId: string;
        items: Array<{ designator_id: number; qty: number }>;
        userNik?: string | null;
    }) =>
        sql`CALL inventory.sp_update_inout_tag(
            ${params.headerId}::integer,
            ${params.actionType}::varchar,
            ${params.actionId}::varchar,
            ${JSON.stringify(params.items)}::jsonb,
            ${params.userNik || null}::varchar
        )`.execute(dbClient),

    /**
     * Record Material Used - atomic operation
     */
    recordMaterialUsed: (params: {
        warehouseId: number;
        materialId: number;
        qty: number;
        transactionId: string;
        notes?: string | null;
        createdBy: string;
    }) =>
        sql`CALL inventory.sp_record_material_used(
            ${params.warehouseId}::integer,
            ${params.materialId}::integer,
            ${params.qty}::numeric,
            ${params.transactionId}::varchar,
            ${params.notes ?? null}::varchar,
            ${params.createdBy}::varchar
        )`.execute(dbClient),

    /**
     * Edit Transaction Used - atomic operation
     * Matches inventory.sp_edit_transaction_used signature (migration 004)
     */
    editTransactionUsed: (params: {
        usedItemId: number | null;
        usedHeaderId: number;
        sapOutItemId: number;
        designatorId: number;
        newQty: number;
        oldQty: number;
        createdBy: string;
    }) =>
        sql`CALL inventory.sp_edit_transaction_used(
            ${params.usedItemId}::bigint,
            ${params.usedHeaderId}::bigint,
            ${params.sapOutItemId}::bigint,
            ${params.designatorId}::bigint,
            ${params.newQty}::numeric,
            ${params.oldQty}::numeric,
            ${params.createdBy}::varchar
        )`.execute(dbClient),

    /**
     * Create Out SAP - atomic operation via sp_create_out_sap (migration 021)
     */
    createOutSap: async (params: {
        warehouseId: number;
        nikTeknisi: string;
        nameSa: string;
        idReservasi: string | null;
        sapNumber: string;
        requestId: string;
        createdBy: string;
        items: Array<{
            designator_id: number;
            qty_req: number;
            unit_price?: number;
        }>;
    }) => {
        const res = await sql<{ p_header_id: string; p_id_trx: string }>`
            CALL inventory.sp_create_out_sap(
                ${params.warehouseId}::integer,
                ${params.nikTeknisi.trim()}::varchar,
                ${params.nameSa.trim()}::varchar,
                ${params.idReservasi ? params.idReservasi.trim() : null}::varchar,
                ${params.sapNumber.trim()}::varchar,
                ${params.requestId.trim()}::varchar,
                ${params.createdBy.trim()}::varchar,
                ${JSON.stringify(params.items)}::jsonb,
                null,
                null
            )
        `.execute(dbClient);

        const row = res.rows[0];
        return {
            headerId: Number(row?.p_header_id),
            idTrx: row?.p_id_trx,
        };
    },

    /**
     * Record SAP Out - atomic operation
     */
    recordSapOut: (params: { headerId: number; warehouseId: number; createdBy: string }) =>
        sql`CALL inventory.sp_sap_out(
            ${params.headerId}::bigint,
            ${params.warehouseId}::integer,
            ${params.createdBy}::varchar
        )`.execute(dbClient),

    /**
     * Create Return Request - atomic operation via sp_create_return_request (migration 040)
     */
    createReturnRequest: async (params: {
        sapOutId: number;
        nikTeknisi: string;
        warehouseId: number;
        notes?: string | null;
        items: Array<{
            sap_out_item_id: number;
            designator_id: number;
            qty: number;
        }>;
        createdBy: string;
    }) => {
        const res = await sql<{ id_trx: string }>`
            SELECT inventory.sp_create_return_request(
                ${params.sapOutId}::bigint,
                ${params.nikTeknisi}::varchar,
                ${params.warehouseId}::bigint,
                ${params.notes ?? null}::text,
                ${JSON.stringify(params.items)}::jsonb,
                ${params.createdBy}::varchar
            ) as id_trx
        `.execute(dbClient);
        return res.rows[0]?.id_trx;
    },

    /**
     * Record Return Material - atomic operation
     * Matches inventory.sp_return_material(p_header_id, p_accept_id, p_user_nik) (migration 047)
     */
    recordReturnMaterial: (params: {
        headerId: number;
        acceptId: string;
        userNik?: string | null;
    }) =>
        sql`CALL inventory.sp_return_material(
            ${params.headerId}::bigint,
            ${params.acceptId}::varchar,
            ${params.userNik || null}::varchar
        )`.execute(dbClient),

    /**
     * Cancel InOut Tag or Return Material - atomic operation
     * Signature matches inventory.sp_cancel_inout_tag (migration 047)
     */
    cancelInOutTag: (params: {
        headerId: number;
        type?: string;
        reason: string;
        userNik: string;
    }) =>
        sql`CALL inventory.sp_cancel_inout_tag(
            ${params.headerId}::bigint,
            ${params.type ?? 'inout'}::varchar,
            ${params.reason}::text,
            ${params.userNik}::varchar
        )`.execute(dbClient),

    /**
     * Record Rekon Lensa v2 - atomic operation
     * Signature matches inventory.sp_record_rekon_lensa_v2 (migration 006)
     */
    recordRekonLensa: (params: {
        idTrx: string;
        idPemakaian: string;
        woNumber: string;
        woType: string;
        nikTeknisi: string;
        nameGudang: string;
        nameSa: string;
        notes: string | null;
        createdBy: string;
        materials: Array<{
            out_sap: string | null;
            designator_id: string;
            qty: number;
            unit_price: number;
        }>;
    }) =>
        sql`CALL inventory.sp_record_rekon_lensa_v2(
            ${params.idTrx}::varchar,
            ${params.idPemakaian}::varchar,
            ${params.woNumber}::varchar,
            ${params.woType}::varchar,
            ${params.nikTeknisi}::varchar,
            ${params.nameGudang}::varchar,
            ${params.nameSa}::varchar,
            ${params.notes}::text,
            ${params.createdBy}::varchar,
            ${JSON.stringify(params.materials)}::json
        )`.execute(dbClient),

    /**
     * Submit Rekon Intech — atomic operation (P0-D1 fix)
     * Encapsulates header insert, item insert, sap_out_items update, audit movement, auto-close.
     */
    submitRekonIntech: (params: {
        idTrx: string;
        nik: string;
        sapOutId: string;
        woNumber: string;
        woType: string | null;
        nameSa: string;
        nameWh: string;
        createdBy: string;
        items: Array<{
            designator_id: number;
            sap_out_item_id: number;
            qty: number;
            notes: string | null;
        }>;
    }) =>
        sql`CALL inventory.sp_submit_rekon_intech(
            ${params.idTrx}::varchar,
            ${params.nik}::varchar,
            ${params.sapOutId}::varchar,
            ${params.woNumber}::varchar,
            ${params.woType}::varchar,
            ${params.nameSa}::varchar,
            ${params.nameWh}::varchar,
            ${params.createdBy}::varchar,
            ${JSON.stringify(params.items)}::jsonb
        )`.execute(dbClient),

    /**
     * Generate deterministic 4-digit sequence for Intech rekon (trx_used_seq)
     */
    generateTrxUsedSeq: async (): Promise<string> => {
        const res = await sql<{ seq: string }>`
            SELECT to_char(nextval('inventory.trx_used_seq'), 'FM0000') as seq
        `.execute(dbClient);
        return res.rows[0]?.seq ?? '0001';
    },

    /**
     * Generate deterministic 4-digit sequence for Lensa rekon (trx_used_lensa_seq)
     */
    generateTrxUsedLensaSeq: async (): Promise<string> => {
        const res = await sql<{ seq: string }>`
            SELECT to_char(nextval('inventory.trx_used_lensa_seq'), 'FM0000') as seq
        `.execute(dbClient);
        return res.rows[0]?.seq ?? '0001';
    },

    /**
     * Flag WO Lensa as reconciled
     */
    markWoLensaReconciled: async (pemakaianId: string, woNumber?: string): Promise<void> => {
        const cleanPemakaianId = pemakaianId.trim();
        const cleanWoNumber = woNumber?.trim();
        let query = dbClient.updateTable('inventory.wo_lensa_header').set({ rekon_check: true });

        if (cleanPemakaianId && cleanWoNumber) {
            query = query.where((eb) =>
                eb.or([
                    eb(sql`CAST(pemakaian_id AS VARCHAR)`, '=', cleanPemakaianId),
                    eb('wo_number', '=', cleanWoNumber),
                ])
            );
        } else if (cleanPemakaianId) {
            query = query.where(sql`CAST(pemakaian_id AS VARCHAR)`, '=', cleanPemakaianId);
        } else if (cleanWoNumber) {
            query = query.where('wo_number', '=', cleanWoNumber);
        } else {
            return;
        }

        await query.execute();
    },

    // ==================== Read Operations (Kysely Query Builder) ====================

    /**
     * List warehouses
     */
    listWarehouses: () =>
        dbClient.selectFrom('inventory.mas_wh').selectAll().orderBy('name').execute(),

    /**
     * Get warehouses with optional warehouse ID scoping
     */
    getWarehouses: (warehouseIds?: readonly number[]) => {
        let query = dbClient.selectFrom('inventory.mas_wh').selectAll().orderBy('name');
        if (warehouseIds !== undefined) {
            if (warehouseIds.length === 0) return Promise.resolve([]);
            query = query.where('id', 'in', warehouseIds as number[]);
        }
        return query.execute();
    },

    /**
     * List materials
     */
    listMaterials: () =>
        dbClient.selectFrom('inventory.materials').selectAll().orderBy('code').execute(),

    /**
     * Get materials with positive stock in a specific warehouse
     */
    getMaterialsInWarehouse: (whId: number) =>
        dbClient
            .selectFrom('inventory.materials as m')
            .innerJoin('inventory.stock_balance as sb', 'm.id', 'sb.designator_id')
            .select(['m.id', 'm.code', 'm.description', 'sb.qty_stock as qty'])
            .where('sb.warehouse_id', '=', whId)
            .where('sb.qty_stock', '>', 0)
            .orderBy('m.code')
            .execute(),

    /**
     * Snapshot stok seluruh gudang untuk halaman publik /live-stock.
     * Read-only: hanya agregat stok + policy, tanpa data transaksi/PIC.
     * hasOutMaterialHistory menandai material yang pernah keluar dari gudang,
     * dipakai untuk menyembunyikan estimasi runout bila belum ada permintaan.
     */
    listLiveStockRows: () =>
        dbClient
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .leftJoin('inventory.stock_policy as sp', (join) =>
                join
                    .onRef('sp.warehouse_id', '=', 'sb.warehouse_id')
                    .onRef('sp.designator_id', '=', 'sb.designator_id')
            )
            .select([
                'sb.warehouse_id as warehouseId',
                'w.name as warehouseName',
                'w.branch as branchName',
                'sb.designator_id as materialId',
                'm.code as materialCode',
                'm.description as materialName',
                'm.unit as materialUnit',
                'sb.qty_stock as qtyStock',
                'sp.min_qty as minQty',
                'sp.max_qty as maxQty',
                'sp.average_demand_weekly as averageDemandWeekly',
                'sp.safety_stock_pct as safetyStockPct',
            ])
            .select((eb) =>
                eb
                    .exists(
                        eb
                            .selectFrom('inventory.stock_movement as sm')
                            .select('sm.id')
                            .whereRef('sm.warehouse_id', '=', 'sb.warehouse_id')
                            .whereRef('sm.designator_id', '=', 'sb.designator_id')
                            .where('sm.movement_type', 'in', [
                                'material_used',
                                'sap_out',
                                'transfer_out',
                            ])
                    )
                    .as('hasOutMaterialHistory')
            )
            .orderBy('w.name')
            .orderBy('m.code')
            .execute(),

    // ==================== Helper Methods ====================

    /**
     * Check if warehouse is internal (same branch as user)
     * Business rule: Internal WH deducts stock, External WH logs only
     */
    isInternalWarehouse: (warehouseId: number, currentBranch: string) =>
        dbClient
            .selectFrom('inventory.mas_wh')
            .where('id', '=', warehouseId)
            .select('branch')
            .executeTakeFirst()
            .then((wh) => wh?.branch === currentBranch),

    /**
     * Get stock balance for material in warehouse
     */
    getStockBalance: (warehouseId: number, designatorId: number) =>
        dbClient
            .selectFrom('inventory.stock_balance')
            .where('warehouse_id', '=', warehouseId)
            .where('designator_id', '=', designatorId)
            .selectAll()
            .executeTakeFirst(),

    /**
     * Get technician intech stock from outstanding SAP out
     */
    getTechnicianIntechStock: (nik: string) =>
        dbClient
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'm.code as material_code',
                'm.description as material_name',
                sql<number>`SUM(soi.qty_req - COALESCE(soi.qty_used, 0))`.as('qty_intech'),
            ])
            .where('soh.nik_teknisi', '=', nik)
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0)
            .groupBy(['m.code', 'm.description'])
            .execute(),

    /**
     * Batch get technician intech stock from outstanding SAP out for multiple NIKs
     */
    getBatchTechnicianIntechStock: (niks: string[]) => {
        if (niks.length === 0) return Promise.resolve([]);
        return dbClient
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'soh.nik_teknisi',
                'm.code as material_code',
                sql<number>`SUM(soi.qty_req - COALESCE(soi.qty_used, 0))`.as('qty_intech'),
            ])
            .where('soh.nik_teknisi', 'in', niks)
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0)
            .groupBy(['soh.nik_teknisi', 'm.code'])
            .execute();
    },

    // ==================== Out SAP Queries ====================

    /**
     * Get Out SAP headers with optional warehouse scoping and aggregated counts
     */
    getOutSaps: async (params?: { warehouseIds?: readonly number[]; limit?: number }) => {
        let sapQuery = dbClient
            .selectFrom('inventory.sap_out_header as soh')
            .leftJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .leftJoin('inventory.mas_wh as w', 'w.id', 'soh.warehouse_id')
            .select([
                'soh.id',
                'soh.id_trx',
                'soh.nik_teknisi',
                't.name as nama_teknisi',
                'soh.name_sa',
                'soh.warehouse_id',
                'w.name as nama_gudang',
                'soh.id_reservasi',
                'soh.sap_number',
                'soh.request_id',
                'soh.request_time',
                'soh.end_status',
            ])
            .orderBy('soh.request_time', 'desc');

        let countQuery = dbClient.selectFrom('inventory.sap_out_header');

        if (params?.warehouseIds !== undefined) {
            if (params.warehouseIds.length === 0) {
                return {
                    data: [],
                    counts: { wait_approve: 0, request: 0, intech: 0, close: 0 },
                };
            }
            sapQuery = sapQuery.where('soh.warehouse_id', 'in', params.warehouseIds as number[]);
            countQuery = countQuery.where('warehouse_id', 'in', params.warehouseIds as number[]);
        }

        const data = await sapQuery.limit(params?.limit ?? 200).execute();

        const resultCount = await countQuery
            .select([
                sql<number>`SUM(CASE WHEN end_status = 'wait_approve' THEN 1 ELSE 0 END)`.as(
                    'wait_approve'
                ),
                sql<number>`SUM(CASE WHEN end_status = 'request' THEN 1 ELSE 0 END)`.as('request'),
                sql<number>`SUM(CASE WHEN end_status = 'intech' THEN 1 ELSE 0 END)`.as('intech'),
                sql<number>`SUM(CASE WHEN end_status = 'close' THEN 1 ELSE 0 END)`.as('close'),
            ])
            .executeTakeFirst();

        const counts = {
            wait_approve: Number(resultCount?.wait_approve || 0),
            request: Number(resultCount?.request || 0),
            intech: Number(resultCount?.intech || 0),
            close: Number(resultCount?.close || 0),
        };

        return { data, counts };
    },

    /**
     * Get Out SAP items by header ID with optional warehouse scoping
     */
    getOutSapItemsByHeaderId: async (
        headerId: number | string,
        warehouseIds?: readonly number[]
    ) => {
        let query = dbClient
            .selectFrom('inventory.sap_out_items as i')
            .innerJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .innerJoin('inventory.sap_out_header as h', 'h.id', 'i.header_id')
            .select([
                'i.id',
                'i.header_id',
                'i.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'i.qty_req',
                'i.qty_used',
                'i.unit_price',
            ])
            .where('i.header_id', '=', String(headerId));

        if (warehouseIds !== undefined) {
            if (warehouseIds.length === 0) return [];
            query = query.where('h.warehouse_id', 'in', warehouseIds as readonly number[]);
        }

        return query.execute();
    },

    /**
     * Get Out SAP header by ID
     */
    getOutSapHeaderById: (headerId: number | string) =>
        dbClient
            .selectFrom('inventory.sap_out_header')
            .selectAll()
            .where('id', '=', String(headerId))
            .executeTakeFirst(),

    /**
     * Update Out SAP status to intech and invoke stock reduction procedure atomically
     */
    updateOutSapStatusToIntech: async (headerId: number | string, userNik: string) => {
        return dbClient.transaction().execute(async (trx) => {
            await trx
                .updateTable('inventory.sap_out_header')
                .set({ end_status: 'intech' })
                .where('id', '=', String(headerId))
                .execute();

            const header = await trx
                .selectFrom('inventory.sap_out_header')
                .select(['warehouse_id'])
                .where('id', '=', String(headerId))
                .executeTakeFirst();

            if (!header) {
                throw new Error('Data Out SAP tidak ditemukan.');
            }

            const warehouseId = Number(header.warehouse_id);
            const repo = createInventoryRepository(trx);
            await repo.recordSapOut({
                headerId: Number(headerId),
                warehouseId,
                createdBy: userNik,
            });

            return { warehouseId };
        });
    },

    // ==================== Hasil Rekon Queries ====================

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

/**
 * Type-safe factory function
 */
export type InventoryRepository = ReturnType<typeof createInventoryRepository>;

/**
 * Singleton repository instance bound to default database connection
 */
export const inventoryRepository = createInventoryRepository(db);
