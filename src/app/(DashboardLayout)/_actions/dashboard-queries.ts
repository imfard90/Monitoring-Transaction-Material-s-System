'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, warehouseScope } from '@/lib/policies';

export async function getWarehouses() {
    const user = await getSessionUser();
    try {
        let query = db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'branch'])
            .orderBy('name', 'asc');
        const scopedWarehouseIds = warehouseScope(user, 'when-assigned');
        if (user.isStaff && !scopedWarehouseIds) return { success: true, data: [] };
        if (scopedWarehouseIds) {
            query = query.where('id', 'in', scopedWarehouseIds);
        }
        const data = await query.execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
    const scopedWarehouseIds = warehouseScope(user, 'when-assigned');
    if (user.isStaff && !scopedWarehouseIds) return { success: true, data: [] };
    if (
        scopedWarehouseIds &&
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
                'p.average_demand_weekly',
                'p.lead_time_weeks',
                'p.safety_stock_pct',
                'p.min_qty',
                'b.qty_stock',
                sql<number>`p.min_qty - b.qty_stock`.as('deficit'),
            ])
            .orderBy('deficit', 'desc')
            .orderBy('w.name')
            .orderBy('m.code');

        if (scopedWarehouseIds) {
            query = query.where('p.warehouse_id', 'in', scopedWarehouseIds);
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
        const scopedWarehouseIds = warehouseScope(user, 'when-assigned');
        const cacheKey =
            scopedWarehouseIds && scopedWarehouseIds.length > 0
                ? `dashboard_kpis_${scopedWarehouseIds.slice().sort().join('_')}`
                : 'dashboard_kpis_all';

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

        // 0. Online Users
        try {
            const { redis } = await import('@/lib/redis');
            const keys = await redis.keys('presence:user:*');
            data.onlineUsers = keys.length;
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
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            intechOpenQuery = intechOpenQuery.where('warehouse_id', 'in', scopedWarehouseIds);
        }
        const intechOpen = await intechOpenQuery.executeTakeFirst();
        data.intechOpen = Number(intechOpen?.total || 0);

        // 0.2 Intech Close (end_status = 'close')
        let intechCloseQuery = db
            .selectFrom('inventory.sap_out_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'close');
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            intechCloseQuery = intechCloseQuery.where('warehouse_id', 'in', scopedWarehouseIds);
        }
        const intechClose = await intechCloseQuery.executeTakeFirst();
        data.intechClose = Number(intechClose?.total || 0);

        // 1. Request Tag
        let requestTagQuery = db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'requested');
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            requestTagQuery = requestTagQuery.where((eb) =>
                eb.or([
                    eb('from_wh_id', 'in', scopedWarehouseIds),
                    eb('to_wh_id', 'in', scopedWarehouseIds),
                ])
            );
        }
        const requestTag = await requestTagQuery.executeTakeFirst();
        data.requestTag = Number(requestTag?.total || 0);

        // 2. Transit Tag
        let transitTagQuery = db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'in_transit');
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            transitTagQuery = transitTagQuery.where((eb) =>
                eb.or([
                    eb('from_wh_id', 'in', scopedWarehouseIds),
                    eb('to_wh_id', 'in', scopedWarehouseIds),
                ])
            );
        }
        const transitTag = await transitTagQuery.executeTakeFirst();
        data.transitTag = Number(transitTag?.total || 0);

        // 3. Close Tag
        let closeTagQuery = db
            .selectFrom('inventory.inout_tag_header')
            .select(sql<number>`COUNT(id)`.as('total'))
            .where('end_status', '=', 'closed');
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            closeTagQuery = closeTagQuery.where((eb) =>
                eb.or([
                    eb('from_wh_id', 'in', scopedWarehouseIds),
                    eb('to_wh_id', 'in', scopedWarehouseIds),
                ])
            );
        }
        const closeTag = await closeTagQuery.executeTakeFirst();
        data.closeTag = Number(closeTag?.total || 0);

        // 4. Return Tek
        let returnTekQuery = db
            .selectFrom('inventory.return_material_header')
            .select(sql<number>`COUNT(id)`.as('total'));
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            returnTekQuery = returnTekQuery.where(
                'warehouse_id',
                'in',
                scopedWarehouseIds.map(String)
            );
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
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            invStockQuery = invStockQuery.where('sb.warehouse_id', 'in', scopedWarehouseIds);
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
        if (scopedWarehouseIds && scopedWarehouseIds.length > 0) {
            intechStockQuery = intechStockQuery.where('soh.warehouse_id', 'in', scopedWarehouseIds);
        }
        const intechStock = await intechStockQuery.executeTakeFirst();
        data.stockIntechRp = Number(intechStock?.total_rp || 0);

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 10);
        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch dashboard KPIs:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: null };
    }
}
