/**
 * Inventory Repository - Stored procedure wrappers
 * Priority: Use stored procedures for atomicity and data integrity
 * All critical operations go through stored procedures in inventory schema
 */
import { type Kysely, sql, type Transaction } from 'kysely';
import type { DB } from '@/lib/db/database.types';

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
export const createInventoryRepository = (db: Kysely<DB> | Transaction<DB>) => ({
    // ==================== Stored Procedure Wrappers (Priority) ====================

    /**
     * Create InOut Tag - atomic operation
     * Validates: stock availability, internal/external WH, status transitions
     */
    createInOutTag: (params: {
        fromWhId: number;
        toWhId: number;
        items: Array<{ material_id: number; qty: number }>;
        requestId?: string;
        vendorName?: string;
        cost: number;
        idemKey: string;
        createdBy: number;
    }) =>
        sql`CALL inventory.sp_create_inout_tag(
      ${params.fromWhId}::integer,
      ${params.toWhId}::integer,
      ${JSON.stringify(params.items)}::jsonb,
      ${params.requestId ?? null}::varchar,
      ${params.vendorName ?? null}::varchar,
      ${params.cost}::numeric,
      ${params.idemKey}::varchar,
      ${params.createdBy}::integer
    )`.execute(db),

    /**
     * Update InOut Tag (request/send/accept) - atomic operation
     */
    updateInOutTag: (params: {
        headerId: number;
        actionType: 'request' | 'send' | 'accept';
        actionId: string;
        items: Array<{ material_id: number; qty: number }>;
        idemKey: string;
    }) =>
        sql`CALL inventory.sp_update_inout_tag(
      ${params.headerId}::bigint,
      ${params.actionType}::varchar,
      ${params.actionId}::varchar,
      ${JSON.stringify(params.items)}::jsonb,
      ${params.idemKey}::varchar
    )`.execute(db),

    /**
     * Record Material Used - atomic operation
     */
    recordMaterialUsed: (params: {
        warehouseId: number;
        materialId: number;
        qty: number;
        transactionId: string;
        notes?: string;
        createdBy: number;
    }) =>
        sql`CALL inventory.sp_record_material_used(
      ${params.warehouseId}::integer,
      ${params.materialId}::integer,
      ${params.qty}::numeric,
      ${params.transactionId}::varchar,
      ${params.notes ?? null}::varchar,
      ${params.createdBy}::integer
    )`.execute(db),

    /**
     * Edit Transaction Used - atomic operation
     */
    editTransactionUsed: (params: { itemId: number; qty: number; notes?: string }) =>
        sql`CALL inventory.sp_edit_transaction_used(
      ${params.itemId}::bigint,
      ${params.qty}::numeric,
      ${params.notes ?? null}::varchar
    )`.execute(db),

    /**
     * Record SAP Out - atomic operation
     */
    recordSapOut: (params: { headerId: number; warehouseId: number; createdBy: number }) =>
        sql`CALL inventory.sp_sap_out(
      ${params.headerId}::bigint,
      ${params.warehouseId}::integer,
      ${params.createdBy}::integer
    )`.execute(db),

    /**
     * Record Return Material - atomic operation
     */
    recordReturnMaterial: (params: { headerId: number; acceptId: string; idemKey: string }) =>
        sql`CALL inventory.sp_return_material(
      ${params.headerId}::bigint,
      ${params.acceptId}::varchar,
      ${params.idemKey}::varchar
    )`.execute(db),

    /**
     * Record Rekon Lensa v2 - atomic operation
     */
    recordRekonLensa: (params: {
        warehouseId: number;
        items: Array<{ material_id: number; qty: number; notes?: string }>;
        createdBy: number;
    }) =>
        sql`CALL inventory.sp_record_rekon_lensa_v2(
      ${params.warehouseId}::integer,
      ${JSON.stringify(params.items)}::jsonb,
      ${params.createdBy}::integer
    )`.execute(db),

    // ==================== Read Operations (Kysely Query Builder) ====================

    /**
     * List warehouses
     */
    listWarehouses: () => db.selectFrom('inventory.mas_wh').selectAll().orderBy('name').execute(),

    /**
     * List materials
     */
    listMaterials: () => db.selectFrom('inventory.materials').selectAll().orderBy('code').execute(),

    // ==================== Helper Methods ====================

    /**
     * Check if warehouse is internal (same branch as user)
     * Business rule: Internal WH deducts stock, External WH logs only
     */
    isInternalWarehouse: (warehouseId: number, currentBranch: string) =>
        db
            .selectFrom('inventory.mas_wh')
            .where('id', '=', warehouseId)
            .select('branch')
            .executeTakeFirst()
            .then((wh) => wh?.branch === currentBranch),

    /**
     * Get stock balance for material in warehouse
     */
    getStockBalance: (warehouseId: number, designatorId: number) =>
        db
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
