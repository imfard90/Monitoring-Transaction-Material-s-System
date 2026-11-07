'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import {
    canAccessWarehouse,
    resolveWarehouseScope,
    warehouseScopeCacheKey,
} from '@/lib/policies';
import type {
    IntechAgingData,
    IntechAgingTier,
    IntechTopMaterial,
    IntechTopTechnician,
} from './types';

const getIntechAgingDataSchema = z.object({
    wh_id: z.union([z.literal('all'), z.string().regex(/^\d+$/)]).default('all'),
});

export async function getIntechAgingData(wh_id: string = 'all') {
    const user = await getSessionUser();
    const parsed = getIntechAgingDataSchema.safeParse({ wh_id });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getIntechAgingData', {
            issues: parsed.error.issues,
        });
        return { success: false, error: 'Parameter tidak valid' };
    }

    try {
        const scope = resolveWarehouseScope(user);
        if (scope.kind === 'none') {
            return { success: false, error: 'Akses gudang ditolak' };
        }
        if (scope.kind === 'scoped' && wh_id !== 'all' && !canAccessWarehouse(user, Number(wh_id))) {
            return { success: false, error: 'Akses gudang ditolak' };
        }

        const cacheKey = `intech_aging_${wh_id}_${warehouseScopeCacheKey(scope)}`;
        const cached = await encryptedCache.getGeneral<IntechAgingData>('dashboard', cacheKey);
        if (cached) {
            return { success: true, data: cached };
        }

        // 1. Aging breakdown query
        let agingQuery = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .select([
                sql<number>`COUNT(*)::int`.as('total_records'),
                sql<number>`COALESCE(SUM(soi.qty_req - COALESCE(soi.qty_used, 0)), 0)::numeric`.as(
                    'total_qty'
                ),
                sql<number>`COUNT(CASE WHEN CURRENT_DATE - soh.request_time::date < 7 THEN 1 END)::int`.as(
                    'under_7d_count'
                ),
                sql<number>`COALESCE(SUM(CASE WHEN CURRENT_DATE - soh.request_time::date < 7 THEN soi.qty_req - COALESCE(soi.qty_used, 0) ELSE 0 END), 0)::numeric`.as(
                    'under_7d_qty'
                ),
                sql<number>`COUNT(CASE WHEN CURRENT_DATE - soh.request_time::date >= 7 AND CURRENT_DATE - soh.request_time::date <= 14 THEN 1 END)::int`.as(
                    'd7_to_14d_count'
                ),
                sql<number>`COALESCE(SUM(CASE WHEN CURRENT_DATE - soh.request_time::date >= 7 AND CURRENT_DATE - soh.request_time::date <= 14 THEN soi.qty_req - COALESCE(soi.qty_used, 0) ELSE 0 END), 0)::numeric`.as(
                    'd7_to_14d_qty'
                ),
                sql<number>`COUNT(CASE WHEN CURRENT_DATE - soh.request_time::date > 14 THEN 1 END)::int`.as(
                    'over_14d_count'
                ),
                sql<number>`COALESCE(SUM(CASE WHEN CURRENT_DATE - soh.request_time::date > 14 THEN soi.qty_req - COALESCE(soi.qty_used, 0) ELSE 0 END), 0)::numeric`.as(
                    'over_14d_qty'
                ),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);

        if (wh_id !== 'all') {
            agingQuery = agingQuery.where('soh.warehouse_id', '=', Number(wh_id));
        } else if (scope.kind === 'scoped') {
            agingQuery = agingQuery.where('soh.warehouse_id', 'in', scope.ids);
        }

        const agingRes = await agingQuery.executeTakeFirst();
        const totalRecords = Number(agingRes?.total_records || 0);
        const totalQty = Number(agingRes?.total_qty || 0);
        const under7Count = Number(agingRes?.under_7d_count || 0);
        const under7Qty = Number(agingRes?.under_7d_qty || 0);
        const d7To14Count = Number(agingRes?.d7_to_14d_count || 0);
        const d7To14Qty = Number(agingRes?.d7_to_14d_qty || 0);
        const over14Count = Number(agingRes?.over_14d_count || 0);
        const over14Qty = Number(agingRes?.over_14d_qty || 0);

        const tiers: IntechAgingTier[] = [
            {
                key: 'under_7d',
                label: '< 7 Hari',
                description: 'Normal / Baru',
                count: under7Count,
                qty: under7Qty,
                percentage:
                    totalRecords > 0 ? Math.round((under7Count / totalRecords) * 1000) / 10 : 0,
                color: '#10B981',
            },
            {
                key: 'd7_to_14d',
                label: '7–14 Hari',
                description: 'Waspada / Perlu Monitoring',
                count: d7To14Count,
                qty: d7To14Qty,
                percentage:
                    totalRecords > 0 ? Math.round((d7To14Count / totalRecords) * 1000) / 10 : 0,
                color: '#F59E0B',
            },
            {
                key: 'over_14d',
                label: '> 14 Hari',
                description: 'Kritis / Segera Rekon',
                count: over14Count,
                qty: over14Qty,
                percentage:
                    totalRecords > 0 ? Math.round((over14Count / totalRecords) * 1000) / 10 : 0,
                color: '#EF4444',
            },
        ];

        // 2. Top materials query
        let topMatQuery = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'm.code',
                'm.description',
                'm.unit',
                sql<number>`SUM(soi.qty_req - COALESCE(soi.qty_used, 0))::numeric`.as('qty_intech'),
                sql<number>`COUNT(DISTINCT soh.id)::int`.as('tx_count'),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);

        if (wh_id !== 'all') {
            topMatQuery = topMatQuery.where('soh.warehouse_id', '=', Number(wh_id));
        } else if (scope.kind === 'scoped') {
            topMatQuery = topMatQuery.where('soh.warehouse_id', 'in', scope.ids);
        }

        const topMatRows = await topMatQuery
            .groupBy(['m.code', 'm.description', 'm.unit'])
            .orderBy(sql`SUM(soi.qty_req - COALESCE(soi.qty_used, 0))`, 'desc')
            .limit(5)
            .execute();

        const topMaterials: IntechTopMaterial[] = topMatRows.map((row) => ({
            code: row.code || '-',
            description: row.description || row.code || '-',
            unit: row.unit || 'PC',
            qty_intech: Number(row.qty_intech || 0),
            tx_count: Number(row.tx_count || 0),
        }));

        // 3. Top technicians query
        let topTekQuery = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .leftJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .select([
                'soh.nik_teknisi as nik',
                sql<string>`COALESCE(t.name, soh.nik_teknisi)`.as('name'),
                sql<number>`SUM(soi.qty_req - COALESCE(soi.qty_used, 0))::numeric`.as('qty_intech'),
                sql<number>`COUNT(DISTINCT soh.id)::int`.as('tx_count'),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0);

        if (wh_id !== 'all') {
            topTekQuery = topTekQuery.where('soh.warehouse_id', '=', Number(wh_id));
        } else if (scope.kind === 'scoped') {
            topTekQuery = topTekQuery.where('soh.warehouse_id', 'in', scope.ids);
        }

        const topTekRows = await topTekQuery
            .groupBy(['soh.nik_teknisi', 't.name'])
            .orderBy(sql`SUM(soi.qty_req - COALESCE(soi.qty_used, 0))`, 'desc')
            .limit(5)
            .execute();

        const topTechnicians: IntechTopTechnician[] = topTekRows.map((row) => ({
            nik: row.nik,
            name: row.name || row.nik,
            qty_intech: Number(row.qty_intech || 0),
            tx_count: Number(row.tx_count || 0),
        }));

        const data: IntechAgingData = {
            totalRecords,
            totalQty,
            tiers,
            topMaterials,
            topTechnicians,
        };

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 15);
        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch intech aging data:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal memuat data aging stok intech' };
    }
}
