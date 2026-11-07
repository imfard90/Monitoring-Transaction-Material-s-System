'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, resolveWarehouseScope } from '@/lib/policies';

const getOutMaterialLineChartDataSchema = z.object({
    wh_id: z.string().min(1),
    limit: z.number().int().positive().max(50).default(20),
});

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
    const scope = resolveWarehouseScope(user);
    if (scope.kind === 'none') return { success: true, data: [] };
    if (
        scope.kind === 'scoped' &&
        parsed.data.wh_id !== 'all' &&
        !canAccessWarehouse(user, Number(parsed.data.wh_id))
    ) {
        return { success: false, error: 'Akses gudang ditolak' };
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
                'm.unit as material_unit',
                sql<number>`SUM(soi.qty_req)`.as('total_qty'),
            ])
            .where(sql`COALESCE(soh.sap_time, soh.request_time)`, '>=', thirtyDaysAgo)
            .groupBy(['m.code', 'm.description', 'm.unit'])
            .orderBy('total_qty', 'desc')
            .limit(validLimit);

        if (scope.kind === 'scoped') {
            topMatQuery = topMatQuery.where('soh.warehouse_id', 'in', scope.ids);
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
                'm.unit as material_unit',
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
                'm.unit',
                sql`TO_CHAR(COALESCE(soh.sap_time, soh.request_time), 'YYYY-MM-DD')`,
            ]);

        if (scope.kind === 'scoped') {
            dailyQuery = dailyQuery.where('soh.warehouse_id', 'in', scope.ids);
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
