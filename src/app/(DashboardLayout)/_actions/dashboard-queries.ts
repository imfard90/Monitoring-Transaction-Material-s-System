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
            query = query.where('id', 'in', scope.ids);
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
            query = query.where('p.warehouse_id', 'in', scope.ids);
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

        // 0.1 Intech Open (end_status = 'intech')
        let intechOpenQuery = db
            .selectFrom('inventory.sap_out_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'intech');
        if (scope.kind === 'scoped') {
            intechOpenQuery = intechOpenQuery.where('warehouse_id', 'in', scope.ids);
        }
        const intechOpen = await intechOpenQuery.executeTakeFirst();
        data.intechOpen = Number(intechOpen?.total || 0);

        // 0.2 Intech Close (end_status = 'close')
        let intechCloseQuery = db
            .selectFrom('inventory.sap_out_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'close');
        if (scope.kind === 'scoped') {
            intechCloseQuery = intechCloseQuery.where('warehouse_id', 'in', scope.ids);
        }
        const intechClose = await intechCloseQuery.executeTakeFirst();
        data.intechClose = Number(intechClose?.total || 0);

        // 1. Request Tag
        let requestTagQuery = db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'requested');
        if (scope.kind === 'scoped') {
            requestTagQuery = requestTagQuery.where((eb) =>
                eb.or([eb('from_wh_id', 'in', scope.ids), eb('to_wh_id', 'in', scope.ids)])
            );
        }
        const requestTag = await requestTagQuery.executeTakeFirst();
        data.requestTag = Number(requestTag?.total || 0);

        // 2. Transit Tag
        let transitTagQuery = db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'in_transit');
        if (scope.kind === 'scoped') {
            transitTagQuery = transitTagQuery.where((eb) =>
                eb.or([eb('from_wh_id', 'in', scope.ids), eb('to_wh_id', 'in', scope.ids)])
            );
        }
        const transitTag = await transitTagQuery.executeTakeFirst();
        data.transitTag = Number(transitTag?.total || 0);

        // 3. Close Tag
        let closeTagQuery = db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'closed');
        if (scope.kind === 'scoped') {
            closeTagQuery = closeTagQuery.where((eb) =>
                eb.or([eb('from_wh_id', 'in', scope.ids), eb('to_wh_id', 'in', scope.ids)])
            );
        }
        const closeTag = await closeTagQuery.executeTakeFirst();
        data.closeTag = Number(closeTag?.total || 0);

        // 4. Return Tek
        let returnTekQuery = db
            .selectFrom('inventory.return_material_header')
            .select(sql<number>`COUNT(id)`.as('total'));
        if (scope.kind === 'scoped') {
            returnTekQuery = returnTekQuery.where('warehouse_id', 'in', scope.ids.map(String));
        }
        const returnTek = await returnTekQuery.executeTakeFirst();
        data.returnTek = Number(returnTek?.total || 0);

        // 5. Stock Inventory Rupiah
        let invStockQuery = db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .select(
                sql<number>`COALESCE(SUM(sb.qty_stock * COALESCE(m.price, 0)), 0)`.as('total_rp')
            )
            .where('sb.qty_stock', '>', 0);
        if (scope.kind === 'scoped') {
            invStockQuery = invStockQuery.where('sb.warehouse_id', 'in', scope.ids);
        }
        const invStock = await invStockQuery.executeTakeFirst();
        data.stockInventoryRp = Number(invStock?.total_rp || 0);

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
            intechStockQuery = intechStockQuery.where('soh.warehouse_id', 'in', scope.ids);
        }
        const intechStock = await intechStockQuery.executeTakeFirst();
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
