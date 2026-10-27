/**
 * Inventory Repository - Stored procedure wrappers
 * Priority: Use stored procedures for atomicity and data integrity
 * All critical operations go through stored procedures in inventory schema
 */

import { type Kysely, sql, type Transaction } from 'kysely';
import type { DB } from '@/lib/db/database.types';
import { db } from '@/lib/db/db';

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
     * List materials
     */
    listMaterials: () =>
        dbClient.selectFrom('inventory.materials').selectAll().orderBy('code').execute(),

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
});

/**
 * Type-safe factory function
 */
export type InventoryRepository = ReturnType<typeof createInventoryRepository>;

/**
 * Singleton repository instance bound to default database connection
 */
export const inventoryRepository = createInventoryRepository(db);
