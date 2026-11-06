'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, warehouseScope } from '@/lib/policies';

const getSalesOverviewDataSchema = z.object({
    wh_id: z.string().min(1),
    daysCount: z.number().int().positive().max(90),
    endDate: z.date(),
});

export async function getSalesOverviewData(wh_id: string, daysCount: number, endDate: Date) {
    const user = await getSessionUser();
    const parsed = getSalesOverviewDataSchema.safeParse({ wh_id, daysCount, endDate });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getSalesOverviewData', {
            issues: parsed.error.issues,
        });
        return { success: false, error: 'Invalid parameters' };
    }

    try {
        const cacheKey = `sales_overview_${wh_id}_${daysCount}_${endDate.getTime()}`;
        const cached = await encryptedCache.getGeneral<{
            dates: string[];
            outMaterial: number[];
            hasilRekon: number[];
        }>('dashboard', cacheKey);
        if (cached && !warehouseScope(user, 'always')) {
            actionLogger.debug(`Cache hit for ${cacheKey}`);
            return { success: true, data: cached };
        }

        const scopedWarehouseIds = warehouseScope(user, 'always');
        if (
            scopedWarehouseIds &&
            (scopedWarehouseIds.length === 0 ||
                (wh_id !== 'all' && !canAccessWarehouse(user, Number(wh_id))))
        ) {
            return { success: false, error: 'Akses gudang ditolak' };
        }

        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - daysCount + 1);
        startDate.setHours(0, 0, 0, 0);

        const effectiveEndDate = new Date(endDate);
        effectiveEndDate.setHours(23, 59, 59, 999);

        // 1. Get Out Material from sap_out_items + sap_out_header
        let outQuery = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .select([
                sql<string>`TO_CHAR(COALESCE(soh.sap_time, soh.request_time), 'YYYY-MM-DD')`.as(
                    'date_val'
                ),
                sql<number>`COALESCE(SUM(soi.qty_req), 0)`.as('total_qty'),
            ])
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '>=', startDate)
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '<=', effectiveEndDate)
            .groupBy(sql`TO_CHAR(COALESCE(soh.sap_time, soh.request_time), 'YYYY-MM-DD')`);

        if (scopedWarehouseIds) {
            outQuery = outQuery.where('soh.warehouse_id', 'in', scopedWarehouseIds);
        }
        if (wh_id && wh_id !== 'all') {
            outQuery = outQuery.where('soh.warehouse_id', '=', parseInt(wh_id, 10));
        }

        const outData = await outQuery.execute();

        // 2. Get Hasil Rekon from transaction_used_header
        let rekonQuery = db
            .selectFrom('inventory.transaction_used_header as tu')
            .innerJoin('inventory.transaction_used_item as tui', 'tui.used_id', 'tu.id')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'tu.sap_out_id')
            .select([
                sql<string>`TO_CHAR(tu.created_at, 'YYYY-MM-DD')`.as('date_val'),
                sql<number>`COALESCE(SUM(tui.qty), 0)`.as('total_qty'),
            ])
            .where('tu.created_at', '>=', startDate)
            .where('tu.created_at', '<=', effectiveEndDate)
            .groupBy(sql`TO_CHAR(tu.created_at, 'YYYY-MM-DD')`);

        if (scopedWarehouseIds) {
            rekonQuery = rekonQuery.where('soh.warehouse_id', 'in', scopedWarehouseIds);
        }
        if (wh_id && wh_id !== 'all') {
            rekonQuery = rekonQuery.where('soh.warehouse_id', '=', parseInt(wh_id, 10));
        }

        const intechRekonData = await rekonQuery.execute();

        let lensaRekonQuery = db
            .selectFrom('inventory.rekon_used_header as ruh')
            .innerJoin('inventory.rekon_used_list as rul', 'rul.rekon_used_id', 'ruh.id')
            .innerJoin('inventory.sap_out_header as soh', 'soh.sap_number', 'rul.out_sap')
            .select([
                sql<string>`TO_CHAR(ruh.create_at, 'YYYY-MM-DD')`.as('date_val'),
                sql<number>`COALESCE(SUM(rul.qty), 0)`.as('total_qty'),
            ])
            .where('ruh.create_at', '>=', startDate)
            .where('ruh.create_at', '<=', effectiveEndDate)
            .groupBy(sql`TO_CHAR(ruh.create_at, 'YYYY-MM-DD')`);

        if (scopedWarehouseIds) {
            lensaRekonQuery = lensaRekonQuery.where('soh.warehouse_id', 'in', scopedWarehouseIds);
        }
        if (wh_id && wh_id !== 'all') {
            lensaRekonQuery = lensaRekonQuery.where('soh.warehouse_id', '=', parseInt(wh_id, 10));
        }

        const lensaRekonData = await lensaRekonQuery.execute();
        const rekonData = [...intechRekonData, ...lensaRekonData].reduce((dailyTotals, row) => {
            dailyTotals.set(
                row.date_val,
                (dailyTotals.get(row.date_val) ?? 0) + Number(row.total_qty)
            );
            return dailyTotals;
        }, new Map<string, number>());

        // 3. Format dates
        const dates = [];
        const outMaterial = [];
        const hasilRekon = [];

        for (let i = 0; i < daysCount; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            dates.push(`${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`);

            const outVal = outData.find((o) => o.date_val === dateStr)?.total_qty || 0;
            const rekonVal = rekonData.get(dateStr) || 0;

            outMaterial.push(Number(outVal));
            hasilRekon.push(-Number(rekonVal)); // Negative for chart layout
        }

        const finalData = { dates, outMaterial, hasilRekon };
        if (!warehouseScope(user, 'always')) {
            await encryptedCache.setGeneral('dashboard', finalData, cacheKey, 300); // Cache for 5 mins
        }

        return { success: true, data: finalData };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch sales overview:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

const getTopOutMaterialsSchema = z.object({
    limit: z.number().int().positive().max(50).default(7),
    warehouseId: z.union([z.literal('all'), z.string().regex(/^\d+$/)]).default('all'),
});

export async function getTopOutMaterials(limit: number = 7, warehouseId: string = 'all') {
    const user = await getSessionUser();
    const parsed = getTopOutMaterialsSchema.safeParse({ limit, warehouseId });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getTopOutMaterials', { issues: parsed.error.issues });
        return { success: false, error: 'Invalid parameters' };
    }
    const validLimit = parsed.data.limit;
    const scopedWarehouseIds = warehouseScope(user, 'when-assigned');
    if (user.isStaff && !scopedWarehouseIds) return { success: true, data: [] };
    if (
        scopedWarehouseIds &&
        parsed.data.warehouseId !== 'all' &&
        !canAccessWarehouse(user, Number(parsed.data.warehouseId))
    ) {
        return { success: false, error: 'Akses gudang ditolak' };
    }

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        let query = db
            .selectFrom('inventory.sap_out_items as soi')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'soi.header_id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'm.code as material_code',
                'm.description as material_name',
                'm.unit as material_unit',
                sql<number>`COALESCE(SUM(soi.qty_req), 0)`.as('total_qty'),
            ])
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '>=', thirtyDaysAgo)
            .groupBy(['m.code', 'm.description', 'm.unit'])
            .orderBy('total_qty', 'desc')
            .limit(validLimit);

        if (scopedWarehouseIds) {
            query = query.where('soh.warehouse_id', 'in', scopedWarehouseIds);
        } else if (parsed.data.warehouseId !== 'all') {
            query = query.where('soh.warehouse_id', '=', Number(parsed.data.warehouseId));
        }

        const data = await query.execute();

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch top out materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
