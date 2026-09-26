'use server';

import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import { getSessionUser } from '@/lib/auth-server';

export async function getStockBalances() {
    try {
        const balances = await db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .select([
                'sb.id',
                'sb.warehouse_id',
                'w.name as warehouse_name',
                'w.branch as branch_name',
                'sb.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'sb.qty_stock',
            ])
            .orderBy('w.name', 'asc')
            .orderBy('m.code', 'asc')
            .execute();

        return { success: true, data: balances };
    } catch (error: any) {
        console.error('Failed to fetch stock balances:', error);
        return { success: false, error: error.message };
    }
}

export async function getDashboardStockIntech() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const applyWhFilter = isStaff && warehouseIds.length > 0;

        let query = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .leftJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'soh.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'wh.branch as branch',
                'wh.name as wh_name',
                't.name as teknisi',
                'soh.nik_teknisi as nik',
                'm.code as material_code',
                'm.description as material_name',
                sql<number>`soi.qty_req - COALESCE(soi.qty_used, 0)`.as('qty_intech'),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);

        if (applyWhFilter) {
            query = query.where('soh.warehouse_id', 'in', warehouseIds as any);
        }

        const data = await query
            .orderBy('wh.branch', 'asc')
            .orderBy('t.name', 'asc')
            .execute();

        return { success: true, data };
    } catch (error: any) {
        console.error('Failed to fetch dashboard stock intech:', error);
        return { success: false, error: error.message };
    }
}

export async function getSalesOverviewData(wh_id: string, daysCount: number, endDate: Date) {
    try {
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

        if (wh_id && wh_id !== 'all') {
            rekonQuery = rekonQuery.where('soh.warehouse_id', '=', parseInt(wh_id, 10));
        }

        const rekonData = await rekonQuery.execute();

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
            const rekonVal = rekonData.find((r) => r.date_val === dateStr)?.total_qty || 0;

            outMaterial.push(Number(outVal));
            hasilRekon.push(-Number(rekonVal)); // Negative for chart layout
        }

        return { success: true, data: { dates, outMaterial, hasilRekon } };
    } catch (error: any) {
        console.error('Failed to fetch sales overview:', error);
        return { success: false, error: error.message };
    }
}

export async function getTopOutMaterials(limit: number = 7) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const data = await db
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
            .limit(limit)
            .execute();

        return { success: true, data };
    } catch (error: any) {
        console.error('Failed to fetch top out materials:', error);
        return { success: false, error: error.message };
    }
}

export async function getOutMaterialLineChartData(wh_id: string, limit: number = 20) {
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
            .limit(limit);

        if (wh_id && wh_id !== 'all') {
            topMatQuery = topMatQuery.where('soh.warehouse_id', '=', parseInt(wh_id, 10));
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

        if (wh_id && wh_id !== 'all') {
            dailyQuery = dailyQuery.where('soh.warehouse_id', '=', parseInt(wh_id, 10));
        }

        const dailyData = await dailyQuery.execute();

        return { success: true, data: { topMats, dailyData, startDate: thirtyDaysAgo } };
    } catch (error: any) {
        console.error('Failed to fetch out material line chart data:', error);
        return { success: false, error: error.message };
    }
}

export async function getWarehousePerformance() {
    try {
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

        return { success: true, data };
    } catch (error: any) {
        console.error('Failed to fetch warehouse performance:', error);
        return { success: false, error: error.message };
    }
}

export async function getWarehouses() {
    try {
        const data = await db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'branch'])
            .orderBy('name', 'asc')
            .execute();

        return { success: true, data };
    } catch (error: any) {
        console.error('Failed to fetch warehouses:', error);
        return { success: false, error: error.message };
    }
}
export async function getStockWarnings() {
    try {
        const data = await db
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
            .orderBy('m.code')
            .limit(15)
            .execute();

        return { success: true, data };
    } catch (error: any) {
        console.error('Failed to fetch stock warnings:', error);
        return { success: false, data: [] };
    }
}
