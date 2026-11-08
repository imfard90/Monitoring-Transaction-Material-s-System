'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse, resolveWarehouseScope, warehouseScopeCacheKey } from '@/lib/policies';
import type { RekonSlaData, RekonSlaTier } from './types';

const getRekonSlaVelocitySchema = z.object({
    wh_id: z.union([z.literal('all'), z.string().regex(/^\d+$/)]).default('all'),
});

export async function getRekonSlaVelocity(wh_id: string = 'all') {
    const user = await getSessionUser();
    const parsed = getRekonSlaVelocitySchema.safeParse({ wh_id });
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getRekonSlaVelocity', {
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

        const cacheKey = `rekon_sla_${wh_id}_${warehouseScopeCacheKey(scope)}`;
        const cached = await encryptedCache.getGeneral<RekonSlaData>('dashboard', cacheKey);
        if (cached) {
            return { success: true, data: cached };
        }

        let query = db
            .selectFrom('inventory.sap_out_header as soh')
            .select([
                sql<number>`COUNT(*)::int`.as('total_open'),
                sql<number>`ROUND(AVG(CURRENT_DATE - soh.request_time::date), 1)`.as(
                    'avg_days_open'
                ),
                sql<number>`COUNT(CASE WHEN CURRENT_DATE - soh.request_time::date <= 3 THEN 1 END)::int`.as(
                    'on_time_count'
                ),
                sql<number>`COUNT(CASE WHEN CURRENT_DATE - soh.request_time::date > 3 AND CURRENT_DATE - soh.request_time::date <= 7 THEN 1 END)::int`.as(
                    'warning_count'
                ),
                sql<number>`COUNT(CASE WHEN CURRENT_DATE - soh.request_time::date > 7 THEN 1 END)::int`.as(
                    'breached_count'
                ),
            ])
            .where('soh.end_status', '=', 'intech');

        if (wh_id !== 'all') {
            query = query.where('soh.warehouse_id', '=', Number(wh_id));
        } else if (scope.kind === 'scoped') {
            query = query.where('soh.warehouse_id', 'in', scope.ids);
        }

        const res = await query.executeTakeFirst();
        const totalOpen = Number(res?.total_open || 0);
        const avgDays = Number(res?.avg_days_open || 0);
        const onTimeCount = Number(res?.on_time_count || 0);
        const warningCount = Number(res?.warning_count || 0);
        const breachedCount = Number(res?.breached_count || 0);

        const onTimePct = totalOpen > 0 ? Math.round((onTimeCount / totalOpen) * 1000) / 10 : 0;
        const warningPct = totalOpen > 0 ? Math.round((warningCount / totalOpen) * 1000) / 10 : 0;
        const breachedPct = totalOpen > 0 ? Math.round((breachedCount / totalOpen) * 1000) / 10 : 0;
        const slaRate = Math.round(onTimePct);

        const tiers: RekonSlaTier[] = [
            {
                key: 'on_time',
                label: '≤ 3 Hari (Sesuai SLA)',
                description: 'Tepat waktu dan patuh standar',
                count: onTimeCount,
                percentage: onTimePct,
                color: '#10B981',
            },
            {
                key: 'warning',
                label: '4–7 Hari (Waspada)',
                description: 'Mendekati batas toleransi',
                count: warningCount,
                percentage: warningPct,
                color: '#F59E0B',
            },
            {
                key: 'breached',
                label: '> 7 Hari (Melewati SLA)',
                description: 'Kritis, perlu intervensi',
                count: breachedCount,
                percentage: breachedPct,
                color: '#EF4444',
            },
        ];

        const data: RekonSlaData = {
            totalOpen,
            avgDays,
            slaRate,
            tiers,
        };

        await encryptedCache.setGeneral('dashboard', data, cacheKey, 20);
        return { success: true, data };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch rekon SLA velocity:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal memuat kepatuhan SLA rekon' };
    }
}
