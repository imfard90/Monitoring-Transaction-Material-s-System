'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser, type SessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, resolveWarehouseScope, warehouseScopeCacheKey } from '@/lib/policies';
import { countActiveOnlineUsers } from '@/lib/presence';

export async function getWarehouses(currentUser?: SessionUser) {
    try {
        const user = currentUser ?? (await getSessionUser());
        let query = db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'branch'])
            .orderBy('name', 'asc');
        const scope = resolveWarehouseScope(user);
        if (scope.kind === 'none') return { success: true, data: [] };
        if (scope.kind === 'scoped') {
            query = query.where(sql<boolean>`${sql.ref('id')} = ANY(${scope.ids}::int[])`);
        }
        const data = await query.execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.warn(
            'Failed to fetch warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

const stockWarningsSchema = z.object({
    warehouseId: z.union([z.literal('all'), z.string().regex(/^\d+$/)]).default('all'),
});

export async function getStockWarnings(warehouseId: string = 'all') {
    const user = await getSessionUser();
    const parsed = stockWarningsSchema.safeParse({ warehouseId });
    if (!parsed.success) {
        return { success: false, data: [], error: 'Gudang tidak valid' };
    }
    const scope = resolveWarehouseScope(user);
    if (scope.kind === 'none') return { success: true, data: [] };
    if (
        scope.kind === 'scoped' &&
        parsed.data.warehouseId !== 'all' &&
        !canAccessWarehouse(user, Number(parsed.data.warehouseId))
    ) {
        return { success: false, data: [], error: 'Akses gudang ditolak' };
    }

    try {
        let query = db
            .selectFrom('inventory.stock_policy as p')
            .innerJoin('inventory.stock_balance as b', (join) =>
                join
                    .onRef('b.warehouse_id', '=', 'p.warehouse_id')
                    .onRef('b.designator_id', '=', 'p.designator_id')
            )
            .innerJoin('inventory.materials as m', 'm.id', 'p.designator_id')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'p.warehouse_id')
            .select([
                'w.name as warehouse_name',
                'm.code as material_code',
                'm.description as material_name',
                'm.unit as material_unit',
                'p.average_demand_weekly',
                'p.lead_time_weeks',
                'p.safety_stock_pct',
                'p.min_qty',
                'b.qty_stock',
                sql<number>`p.min_qty - b.qty_stock`.as('deficit'),
                'p.updated_at as policy_updated_at',
            ])
            .orderBy('deficit', 'desc')
            .orderBy('w.name')
            .orderBy('m.code');

        if (scope.kind === 'scoped') {
            query = query.where(sql<boolean>`${sql.ref('p.warehouse_id')} = ANY(${scope.ids}::int[])`);
        } else if (parsed.data.warehouseId !== 'all') {
            query = query.where('p.warehouse_id', '=', Number(parsed.data.warehouseId));
        }

        const data = await query.execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch stock warnings:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getDashboardKpis() {
    try {
        const user = await getSessionUser();
        const scope = resolveWarehouseScope(user);
        if (scope.kind === 'none') {
            return {
                success: true,
                data: {
                    onlineUsers: 0,
                    requestTag: 0,
                    transitTag: 0,
                    closeTag: 0,
                    returnTek: 0,
                    intechOpen: 0,
                    intechClose: 0,
                    stockInventoryRp: 0,
                    stockIntechRp: 0,
                },
            };
        }
        // Cache key MUST include the warehouse scope — otherwise users with different
        // warehouse assignments share the same cached KPI payload.
        const cacheKey = `dashboard_kpis_${warehouseScopeCacheKey(scope)}`;

        const cached = await encryptedCache.getGeneral<unknown>('dashboard', cacheKey);
        if (cached) {
            return { success: true, data: cached };
        }

        const data = {
            onlineUsers: 0,
            requestTag: 0,
            transitTag: 0,
            closeTag: 0,
            returnTek: 0,
            intechOpen: 0,
            intechClose: 0,
            stockInventoryRp: 0,
            stockIntechRp: 0,
        };

        // 0. Online Users (non-blocking SCAN on distinct presence index keys)
        try {
            const { redis } = await import('@/lib/redis');
            data.onlineUsers = await countActiveOnlineUsers(redis);
        } catch (e) {
            actionLogger.error(
                'Failed to get online users count',
                e instanceof Error ? e : new Error(String(e))
            );
        }

        // 0. Intech Open & Close (consolidated single query)
        let sapOutKpiQuery = db
            .selectFrom('inventory.sap_out_header')
            .select([
                sql<number>`COUNT(*) FILTER (WHERE end_status = 'intech')`.as('intech_open'),
                sql<number>`COUNT(*) FILTER (WHERE end_status = 'close')`.as('intech_close'),
            ]);
        if (scope.kind === 'scoped') {
            sapOutKpiQuery = sapOutKpiQuery.where(
                sql<boolean>`${sql.ref('warehouse_id')} = ANY(${scope.ids}::int[])`
            );
        }

        // 1-3. InOut Tag Counts (consolidated single query)
        let tagKpiQuery = db
            .selectFrom('inventory.inout_tag_header')
            .select([
                sql<number>`COUNT(*) FILTER (WHERE end_status = 'requested')`.as('request_tag'),
                sql<number>`COUNT(*) FILTER (WHERE end_status = 'in_transit')`.as('transit_tag'),
                sql<number>`COUNT(*) FILTER (WHERE end_status = 'closed')`.as('close_tag'),
            ]);
        if (scope.kind === 'scoped') {
            tagKpiQuery = tagKpiQuery.where(
                sql<boolean>`(${sql.ref('from_wh_id')} = ANY(${scope.ids}::int[]) OR ${sql.ref('to_wh_id')} = ANY(${scope.ids}::int[]))`
            );
        }

        // 4. Return Tek
        let returnTekQuery = db
            .selectFrom('inventory.return_material_header')
            .select(sql<number>`COUNT(id)`.as('total'));
        if (scope.kind === 'scoped') {
            returnTekQuery = returnTekQuery.where(
                sql<boolean>`${sql.ref('warehouse_id')} = ANY(${scope.ids}::int[])`
            );
        }

        // 5. Stock Inventory Rupiah
        let invStockQuery = db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .select(
                sql<number>`COALESCE(SUM(sb.qty_stock * COALESCE(m.price, 0)), 0)`.as('total_rp')
            )
            .where('sb.qty_stock', '>', 0);
        if (scope.kind === 'scoped') {
            invStockQuery = invStockQuery.where(
                sql<boolean>`${sql.ref('sb.warehouse_id')} = ANY(${scope.ids}::int[])`
            );
        }

        // 6. Stock Intech Rupiah
        let intechStockQuery = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select(
                sql<number>`COALESCE(SUM((soi.qty_req - COALESCE(soi.qty_used, 0)) * COALESCE(m.price, soi.unit_price, 0)), 0)`.as(
                    'total_rp'
                )
            )
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);
        if (scope.kind === 'scoped') {
            intechStockQuery = intechStockQuery.where(
                sql<boolean>`${sql.ref('soh.warehouse_id')} = ANY(${scope.ids}::int[])`
            );
        }

        const [sapOutKpi, tagKpi, returnTek, invStock, intechStock] = await Promise.all([
            sapOutKpiQuery.executeTakeFirst(),
            tagKpiQuery.executeTakeFirst(),
            returnTekQuery.executeTakeFirst(),
            invStockQuery.executeTakeFirst(),
            intechStockQuery.executeTakeFirst(),
        ]);

        data.intechOpen = Number(sapOutKpi?.intech_open || 0);
        data.intechClose = Number(sapOutKpi?.intech_close || 0);
        data.requestTag = Number(tagKpi?.request_tag || 0);
        data.transitTag = Number(tagKpi?.transit_tag || 0);
        data.closeTag = Number(tagKpi?.close_tag || 0);
        data.returnTek = Number(returnTek?.total || 0);
        data.stockInventoryRp = Number(invStock?.total_rp || 0);
        data.stockIntechRp = Number(intechStock?.total_rp || 0);

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 60);
        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch dashboard KPIs:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: null };
    }
}
