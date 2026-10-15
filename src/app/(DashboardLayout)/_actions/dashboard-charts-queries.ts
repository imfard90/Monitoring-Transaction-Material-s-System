'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

const getSalesOverviewDataSchema = z.object({
    wh_id: z.string().min(1),
    daysCount: z.number().int().positive().max(90),
    endDate: z.date(),
});

const getTopOutMaterialsSchema = z.object({
    limit: z.number().int().positive().max(50).default(7),
    warehouseId: z.union([z.literal('all'), z.string().regex(/^\d+$/)]).default('all'),
});

const getOutMaterialLineChartDataSchema = z.object({
    wh_id: z.string().min(1),
    limit: z.number().int().positive().max(50).default(20),
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
        if (cached && !user.isStaff) {
            actionLogger.debug(`Cache hit for ${cacheKey}`);
            return { success: true, data: cached };
        }

        if (
            user.isStaff &&
            (user.warehouseIds.length === 0 ||
                (wh_id !== 'all' && !user.warehouseIds.includes(Number(wh_id))))
        ) {
            return { success: false, error: 'Akses gudang ditolak' };
        }

        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - daysCount + 1);
        startDate.setHours(0, 0, 0, 0);

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
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '<=', endDate)
            .groupBy(sql`TO_CHAR(COALESCE(soh.sap_time, soh.request_time), 'YYYY-MM-DD')`);

        if (user.isStaff) {
            outQuery = outQuery.where('soh.warehouse_id', 'in', user.warehouseIds);
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
            .where('tu.created_at', '<=', endDate)
            .groupBy(sql`TO_CHAR(tu.created_at, 'YYYY-MM-DD')`);

        if (user.isStaff) {
            rekonQuery = rekonQuery.where('soh.warehouse_id', 'in', user.warehouseIds);
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
            .where('ruh.create_at', '<=', endDate)
            .groupBy(sql`TO_CHAR(ruh.create_at, 'YYYY-MM-DD')`);

        if (user.isStaff) {
            lensaRekonQuery = lensaRekonQuery.where('soh.warehouse_id', 'in', user.warehouseIds);
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
        if (!user.isStaff) {
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

export async function getTopOutMaterials(limit: number = 7, warehouseId: string = 'all') {
    const user = await getSessionUser();
    const parsed = getTopOutMaterialsSchema.safeParse({ limit, warehouseId });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getTopOutMaterials', { issues: parsed.error.issues });
        return { success: false, error: 'Invalid parameters' };
    }
    const validLimit = parsed.data.limit;
    if (user.isStaff) {
        if (user.warehouseIds.length === 0) return { success: true, data: [] };
        if (
            parsed.data.warehouseId !== 'all' &&
            !user.warehouseIds.includes(Number(parsed.data.warehouseId))
        ) {
            return { success: false, error: 'Akses gudang ditolak' };
        }
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
                'm.description as material_name',
                sql<number>`COALESCE(SUM(soi.qty_req), 0)`.as('total_qty'),
            ])
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '>=', thirtyDaysAgo)
            .groupBy('m.description')
            .orderBy('total_qty', 'desc')
            .limit(validLimit);

        if (user.isStaff) {
            query = query.where('soh.warehouse_id', 'in', user.warehouseIds);
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

export async function getOutMaterialLineChartData(wh_id: string, limit: number = 20) {
    const user = await getSessionUser();
    const parsed = getOutMaterialLineChartDataSchema.safeParse({ wh_id, limit });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getOutMaterialLineChartData', {
            issues: parsed.error.issues,
        });
        return { success: false, error: 'Invalid parameters' };
    }
    const validLimit = parsed.data.limit;
    if (user.isStaff) {
        if (user.warehouseIds.length === 0) return { success: true, data: [] };
        if (parsed.data.wh_id !== 'all' && !user.warehouseIds.includes(Number(parsed.data.wh_id))) {
            return { success: false, error: 'Akses gudang ditolak' };
        }
    }

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        // First find top materials
        let topMatQuery = db
            .selectFrom('inventory.sap_out_items as soi')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'soi.header_id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'm.code as material_code',
                'm.description as material_name',
                sql<number>`SUM(soi.qty_req)`.as('total_qty'),
            ])
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '>=', thirtyDaysAgo)
            .groupBy(['m.code', 'm.description'])
            .orderBy('total_qty', 'desc')
            .limit(validLimit);

        if (user.isStaff) {
            topMatQuery = topMatQuery.where('soh.warehouse_id', 'in', user.warehouseIds);
        } else if (wh_id !== 'all') {
            topMatQuery = topMatQuery.where('soh.warehouse_id', '=', Number(wh_id));
        }

        const topMats = await topMatQuery.execute();
        const topMatCodes = topMats.map((t) => t.material_code);

        if (topMatCodes.length === 0) {
            return { success: true, data: [] };
        }

        // Then get daily data for these top materials
        let dailyQuery = db
            .selectFrom('inventory.sap_out_items as soi')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'soi.header_id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'm.code as material_code',
                'm.description as material_name',
                sql<string>`TO_CHAR(COALESCE(soh.sap_time, soh.request_time), 'YYYY-MM-DD')`.as(
                    'date_val'
                ),
                sql<number>`COALESCE(SUM(soi.qty_req), 0)`.as('total_qty'),
            ])
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '>=', thirtyDaysAgo)
            .where('m.code', 'in', topMatCodes)
            .groupBy([
                'm.code',
                'm.description',
                sql`TO_CHAR(COALESCE(soh.sap_time, soh.request_time), 'YYYY-MM-DD')`,
            ]);

        if (user.isStaff) {
            dailyQuery = dailyQuery.where('soh.warehouse_id', 'in', user.warehouseIds);
        } else if (wh_id !== 'all') {
            dailyQuery = dailyQuery.where('soh.warehouse_id', '=', Number(wh_id));
        }

        const dailyData = await dailyQuery.execute();

        return { success: true, data: { topMats, dailyData, startDate: thirtyDaysAgo } };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch out material line chart data:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getWarehousePerformance() {
    try {
        const cacheKey = `warehouse_perf`;
        const cached = await encryptedCache.getGeneral<unknown>('dashboard', cacheKey);
        if (cached) {
            actionLogger.debug(`Cache hit for ${cacheKey}`);
            return { success: true, data: cached };
        }

        // total trx out = count all
        // trx out close = count end_status = 'close'
        const data = await db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.mas_wh as wh', 'wh.id', 'soh.warehouse_id')
            .select([
                'wh.id as key',
                'wh.name as name',
                sql<number>`COUNT(soh.id)`.as('trxOut'),
                sql<number>`SUM(CASE WHEN soh.end_status = 'close' THEN 1 ELSE 0 END)`.as(
                    'trxClose'
                ),
            ])
            .groupBy(['wh.id', 'wh.name'])
            .execute();

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 10);

        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch warehouse performance:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
