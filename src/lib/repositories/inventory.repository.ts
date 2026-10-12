/**
 * Inventory Repository - Stored procedure wrappers
 * Priority: Use stored procedures for atomicity and data integrity
 * All critical operations go through stored procedures in inventory schema
 */
import type { DB } from '@/lib/db/database.types';
import { db } from '@/lib/db/db';
import { type Kysely, type Transaction, sql } from 'kysely';

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
     * Signature matches inventory.sp_create_inout_tag
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
    }) => {
        const res = await sql<{ p_id_trx: string }>`
            CALL inventory.sp_create_inout_tag(
                ${params.fromWhId ? params.fromWhId : null}::bigint,
                ${params.toWhId ? params.toWhId : null}::bigint,
                ${params.requestId || null},
                ${params.vendorName || null},
                ${params.cost},
                ${JSON.stringify(params.items)}::jsonb,
                null
            )
        `.execute(dbClient);
        return res.rows[0]?.p_id_trx;
    },

    /**
     * Update InOut Tag (request/send/accept) - atomic operation
     * Signature matches inventory.sp_update_inout_tag (migration 009)
     * SP accepts 4 params: p_header_id, p_action, p_action_id, p_items_json
     */
    updateInOutTag: (params: {
        headerId: number;
        actionType: 'request' | 'send' | 'accept';
        actionId: string;
        items: Array<{ designator_id: number; qty: number }>;
    }) =>
        sql`CALL inventory.sp_update_inout_tag(
            ${params.headerId}::bigint,
            ${params.actionType}::varchar,
            ${params.actionId}::varchar,
            ${JSON.stringify(params.items)}::jsonb
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
                ${params.nikTeknisi}::varchar,
                ${params.nameSa}::varchar,
                ${params.idReservasi ?? null}::varchar,
                ${params.sapNumber}::varchar,
                ${params.requestId}::varchar,
                ${params.createdBy}::varchar,
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
     * Record Return Material - atomic operation
     * Matches inventory.sp_return_material(p_header_id, p_accept_id)
     */
    recordReturnMaterial: (params: { headerId: number; acceptId: string }) =>
        sql`CALL inventory.sp_return_material(
            ${params.headerId}::bigint,
            ${params.acceptId}::varchar
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
});

/**
 * Type-safe factory function
 */
export type InventoryRepository = ReturnType<typeof createInventoryRepository>;

/**
 * Singleton repository instance bound to default database connection
 */
export const inventoryRepository = createInventoryRepository(db);
