'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, resolveWarehouseScope, warehouseScopeCacheKey } from '@/lib/policies';
import type { StockRunoutItem } from './types';

const getStockRunoutForecastSchema = z.object({
    wh_id: z.union([z.literal('all'), z.string().regex(/^\d+$/)]).default('all'),
    limit: z.number().int().positive().max(50).default(8),
});

export async function getStockRunoutForecast(wh_id: string = 'all', limit: number = 8) {
    const user = await getSessionUser();
    const parsed = getStockRunoutForecastSchema.safeParse({ wh_id, limit });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getStockRunoutForecast', {
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

        const cacheKey = `stock_runout_${wh_id}_${limit}_${warehouseScopeCacheKey(scope)}`;
        const cached = await encryptedCache.getGeneral<StockRunoutItem[]>('dashboard', cacheKey);
        if (cached) {
            return { success: true, data: cached };
        }

        let query = db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .leftJoin('inventory.stock_policy as sp', (join) =>
                join
                    .onRef('sp.warehouse_id', '=', 'sb.warehouse_id')
                    .onRef('sp.designator_id', '=', 'sb.designator_id')
            )
            .select([
                'm.code as material_code',
                'm.description as material_name',
                'm.unit as material_unit',
                'w.name as warehouse_name',
                'sb.qty_stock',
                sql<number>`ROUND(COALESCE(sp.average_demand_weekly, 0)::numeric, 1)`.as(
                    'weekly_demand'
                ),
                sql<number>`ROUND((COALESCE(sp.average_demand_weekly, 0) / 7.0)::numeric, 2)`.as(
                    'daily_demand'
                ),
                sql<number>`
                  CASE 
                    WHEN COALESCE(sp.average_demand_weekly, 0) <= 0 THEN 999
                    ELSE ROUND((sb.qty_stock / (sp.average_demand_weekly / 7.0))::numeric, 1)
                  END
                `.as('days_of_supply'),
                'sp.updated_at as policy_updated_at',
            ])
            .where('sb.qty_stock', '>', 0)
            .where(sql`COALESCE(sp.average_demand_weekly, 0)`, '>', 0);

        if (wh_id !== 'all') {
            query = query.where('sb.warehouse_id', '=', Number(wh_id));
        } else if (scope.kind === 'scoped') {
            query = query.where('sb.warehouse_id', 'in', scope.ids);
        }

        const rows = await query
            .orderBy(sql`sb.qty_stock / (sp.average_demand_weekly / 7.0)`, 'asc')
            .limit(parsed.data.limit)
            .execute();

        const data: StockRunoutItem[] = rows.map((r) => {
            const days = Number(r.days_of_supply || 0);
            let status: 'critical' | 'warning' | 'safe' = 'safe';
            if (days < 7) {
                status = 'critical';
            } else if (days <= 14) {
                status = 'warning';
            }
            return {
                material_code: r.material_code || '-',
                material_name: r.material_name || r.material_code || '-',
                material_unit: r.material_unit || 'PC',
                warehouse_name: r.warehouse_name || '-',
                qty_stock: Number(r.qty_stock || 0),
                weekly_demand: Number(r.weekly_demand || 0),
                daily_demand: Number(r.daily_demand || 0),
                days_of_supply: days,
                status,
                policy_updated_at: r.policy_updated_at
                    ? new Date(r.policy_updated_at).toISOString()
                    : null,
            };
        });

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 30);
        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch stock runout forecast:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal memuat estimasi ketahanan stok' };
    }
}
