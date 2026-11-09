/**
 * Inventory master data and stock read operations.
 *
 * Warehouse and material lists are cached in the L1 LRU cache because they
 * change rarely and are read on nearly every page.
 */

import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import { getOrSetLru, masterDataLru } from '@/lib/cache/lru-cache';
import type { DB } from '@/lib/db/database.types';

export const createMasterDataRepository = (dbClient: Kysely<DB> | Transaction<DB>) => ({
    /**
     * List warehouses (cached in L1 LRU Cache for 10 minutes)
     */
    listWarehouses: () =>
        getOrSetLru(
            masterDataLru,
            'wh:all',
            () => dbClient.selectFrom('inventory.mas_wh').selectAll().orderBy('name').execute(),
            10 * 60 * 1000
        ),

    /**
     * Get warehouses with optional warehouse ID scoping.
     * Reuses cached listWarehouses() and filters in memory to eliminate redundant DB calls.
     */
    getWarehouses: async (warehouseIds?: readonly number[]) => {
        if (warehouseIds !== undefined && warehouseIds.length === 0) {
            return [];
        }
        const allWhs = await getOrSetLru(
            masterDataLru,
            'wh:all',
            () => dbClient.selectFrom('inventory.mas_wh').selectAll().orderBy('name').execute(),
            10 * 60 * 1000
        );
        if (warehouseIds !== undefined) {
            const idSet = new Set(warehouseIds);
            return allWhs.filter((wh) => idSet.has(wh.id));
        }
        return allWhs;
    },

    /**
     * List materials (cached in L1 LRU Cache for 5 minutes)
     */
    listMaterials: () =>
        getOrSetLru(masterDataLru, 'mat:all', () =>
            dbClient.selectFrom('inventory.materials').selectAll().orderBy('code').execute()
        ),

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
     * Search stock balance in a warehouse by material keyword(s).
     * If keywords are provided, matches against material code and description (case-insensitive).
     * Returns up to limit items ordered by qty_stock descending.
     */
    searchWarehouseStockBalance: (
        warehouseId: number,
        keywords: string[] = [],
        limit = 20
    ) => {
        let query = dbClient
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .select([
                'sb.warehouse_id as warehouseId',
                'w.name as warehouseName',
                'w.branch as branchName',
                'sb.designator_id as materialId',
                'm.code as materialCode',
                'm.description as materialName',
                'm.unit as materialUnit',
                'sb.qty_stock as qtyStock',
            ])
            .where('sb.warehouse_id', '=', warehouseId);

        const cleanKeywords = keywords
            .map((k) => k.trim())
            .filter((k) => k.length > 0);

        if (cleanKeywords.length > 0) {
            query = query.where((eb) =>
                eb.or(
                    cleanKeywords.flatMap((kw) => [
                        eb('m.description', 'ilike', `%${kw}%`),
                        eb('m.code', 'ilike', `%${kw}%`),
                    ])
                )
            );
        }

        return query
            .orderBy('sb.qty_stock', 'desc')
            .orderBy('m.code', 'asc')
            .limit(limit)
            .execute();
    },

    /**
     * Search stock balances in a specific warehouse or across all warehouses.
     * If warehouseId is omitted, searches across all active warehouses.
     * Orders by qty_stock descending.
     */
    searchStockBalances: (options: {
        warehouseId?: number;
        keywords?: string[];
        limit?: number;
    }) => {
        const { warehouseId, keywords = [], limit = 25 } = options;
        let query = dbClient
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .select([
                'sb.warehouse_id as warehouseId',
                'w.name as warehouseName',
                'w.branch as branchName',
                'sb.designator_id as materialId',
                'm.code as materialCode',
                'm.description as materialName',
                'm.unit as materialUnit',
                'sb.qty_stock as qtyStock',
            ]);

        if (warehouseId !== undefined) {
            query = query.where('sb.warehouse_id', '=', warehouseId);
        }

        const cleanKeywords = keywords
            .map((k) => k.trim())
            .filter((k) => k.length > 0);

        if (cleanKeywords.length > 0) {
            query = query.where((eb) =>
                eb.or(
                    cleanKeywords.flatMap((kw) => [
                        eb('m.description', 'ilike', `%${kw}%`),
                        eb('m.code', 'ilike', `%${kw}%`),
                    ])
                )
            );
        }

        return query
            .orderBy('sb.qty_stock', 'desc')
            .orderBy('w.name', 'asc')
            .orderBy('m.code', 'asc')
            .limit(limit)
            .execute();
    },

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
                'sp.updated_at as policyUpdatedAt',
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
     * Reuses cached wh:all if present in LRU, otherwise queries DB.
     */
    isInternalWarehouse: async (warehouseId: number, currentBranch: string) => {
        const cachedWhs = masterDataLru.get('wh:all') as
            | Array<{ id: number; branch: string | null }>
            | undefined;
        if (cachedWhs) {
            const wh = cachedWhs.find((w) => w.id === warehouseId);
            return wh?.branch === currentBranch;
        }

        return dbClient
            .selectFrom('inventory.mas_wh')
            .where('id', '=', warehouseId)
            .select('branch')
            .executeTakeFirst()
            .then((wh) => wh?.branch === currentBranch);
    },

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

export type MasterDataRepository = ReturnType<typeof createMasterDataRepository>;
