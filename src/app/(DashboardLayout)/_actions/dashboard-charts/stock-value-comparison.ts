'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, resolveWarehouseScope, warehouseScopeCacheKey } from '@/lib/policies';

const getStockValueComparisonSchema = z.object({
    wh_id: z.union([z.literal('all'), z.string().regex(/^\d+$/)]).default('all'),
});

export async function getStockValueComparison(wh_id: string = 'all') {
    const user = await getSessionUser();
    const parsed = getStockValueComparisonSchema.safeParse({ wh_id });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getStockValueComparison', {
            issues: parsed.error.issues,
        });
        return { success: false, error: 'Parameter tidak valid' };
    }

    try {
        const scope = resolveWarehouseScope(user);
        if (scope.kind === 'none') {
            return { success: false, error: 'Akses gudang ditolak' };
        }
        if (
            scope.kind === 'scoped' &&
            wh_id !== 'all' &&
            !canAccessWarehouse(user, Number(wh_id))
        ) {
            return { success: false, error: 'Akses gudang ditolak' };
        }

        const cacheKey = `stock_val_cmp_${wh_id}_${warehouseScopeCacheKey(scope)}`;
        const cached = await encryptedCache.getGeneral<{
            stockInventoryRp: number;
            stockIntechRp: number;
            totalRp: number;
            inventoryPercentage: number;
            intechPercentage: number;
            totalInventoryQty: number;
            totalIntechQty: number;
        }>('dashboard', cacheKey);

        if (cached) {
            return { success: true, data: cached };
        }

        // 1. Stock Inventory Query (Warehouse)
        let invQuery = db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .select([
                sql<number>`COALESCE(SUM(sb.qty_stock * COALESCE(m.price, 0)), 0)`.as('total_rp'),
                sql<number>`COALESCE(SUM(sb.qty_stock), 0)`.as('total_qty'),
            ])
            .where('sb.qty_stock', '>', 0);

        if (wh_id !== 'all') {
            invQuery = invQuery.where('sb.warehouse_id', '=', Number(wh_id));
        } else if (scope.kind === 'scoped') {
            invQuery = invQuery.where('sb.warehouse_id', 'in', scope.ids);
        }

        const invResult = await invQuery.executeTakeFirst();
        const stockInventoryRp = Number(invResult?.total_rp || 0);
        const totalInventoryQty = Number(invResult?.total_qty || 0);

        // 2. Stock Intech Query (Technicians)
        let intechQuery = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                sql<number>`COALESCE(SUM((soi.qty_req - COALESCE(soi.qty_used, 0)) * COALESCE(m.price, soi.unit_price, 0)), 0)`.as(
                    'total_rp'
                ),
                sql<number>`COALESCE(SUM(soi.qty_req - COALESCE(soi.qty_used, 0)), 0)`.as(
                    'total_qty'
                ),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);

        if (wh_id !== 'all') {
            intechQuery = intechQuery.where('soh.warehouse_id', '=', Number(wh_id));
        } else if (scope.kind === 'scoped') {
            intechQuery = intechQuery.where('soh.warehouse_id', 'in', scope.ids);
        }

        const intechResult = await intechQuery.executeTakeFirst();
        const stockIntechRp = Number(intechResult?.total_rp || 0);
        const totalIntechQty = Number(intechResult?.total_qty || 0);

        const totalRp = stockInventoryRp + stockIntechRp;
        const inventoryPercentage =
            totalRp > 0 ? Math.round((stockInventoryRp / totalRp) * 1000) / 10 : 0;
        const intechPercentage =
            totalRp > 0 ? Math.round((stockIntechRp / totalRp) * 1000) / 10 : 0;

        const data = {
            stockInventoryRp,
            stockIntechRp,
            totalRp,
            inventoryPercentage,
            intechPercentage,
            totalInventoryQty,
            totalIntechQty,
        };

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 15);
        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch stock value comparison:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal memuat perbandingan nilai stok' };
    }
}
