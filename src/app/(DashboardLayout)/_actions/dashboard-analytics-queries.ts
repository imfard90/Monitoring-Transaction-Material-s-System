'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { errors } from '@/lib/errors';
import { actionLogger } from '@/lib/logger';
import { analyticsRepository } from '@/lib/repositories';

const getKproRekonAnalyticsSchema = z.object({
    days: z.number().int().min(1).max(365).default(30),
    district: z.string().trim().default('all'),
});

export interface KproRekonSummaryMetrics {
    totalOrders: number;
    totalRekonLensa: number;
    totalBelumRekon: number;
    persentaseRekon: number;
}

export interface KproRekonAnalyticsData {
    summary: KproRekonSummaryMetrics;
    districtRollup: Array<{
        district_tif: string;
        total_orders: number;
        total_rekon_lensa: number;
        total_belum_rekon: number;
        persentase_rekon: number;
    }>;
    dailyTrend: Array<{
        tgl: string;
        total_orders: number;
        total_rekon_lensa: number;
        total_belum_rekon: number;
        persentase_rekon: number;
    }>;
    districts: string[];
    selectedDistrict: string;
    selectedDays: number;
}

/**
 * Server action untuk mengambil data analitik agregasi K-PRO vs Rekon Lensa
 * bersumber dari Materialized View analytics.mv_kpro_rekon_summary
 */
export async function getKproRekonAnalytics(inputParams?: {
    days?: number;
    district?: string;
}): Promise<{ success: boolean; data?: KproRekonAnalyticsData; error?: string }> {
    const user = await getSessionUser();
    if (!user) {
        throw errors.auth();
    }

    const parsed = getKproRekonAnalyticsSchema.safeParse(inputParams ?? {});
    if (!parsed.success) {
        actionLogger.warn('Invalid params for getKproRekonAnalytics', {
            issues: parsed.error.issues,
        });
        return { success: false, error: 'Parameter filter analitik tidak valid' };
    }

    const { days, district } = parsed.data;

    try {
        const cacheKey = `kpro_rekon_${days}_${district.toLowerCase()}`;
        const cached = await encryptedCache.getGeneral<KproRekonAnalyticsData>('analytics', cacheKey);
        if (cached) {
            return { success: true, data: cached };
        }

        // 1. Ambil rollup semua distrik untuk tabel pemeringkatan & list distrik
        const districtRollup = await analyticsRepository.getKproRekonDistrictRollup({ days });

        // 2. Ambil tren harian (opsional terfilter distrik)
        const dailyTrend = await analyticsRepository.getKproRekonDailyTrend({
            district: district === 'all' ? undefined : district,
            days,
        });

        // 3. Hitung ringkasan metrik KPI
        let totalOrders = 0;
        let totalRekonLensa = 0;
        let totalBelumRekon = 0;

        if (district === 'all') {
            for (const row of districtRollup) {
                totalOrders += Number(row.total_orders);
                totalRekonLensa += Number(row.total_rekon_lensa);
                totalBelumRekon += Number(row.total_belum_rekon);
            }
        } else {
            const matched = districtRollup.find(
                (d) => d.district_tif.toUpperCase() === district.toUpperCase()
            );
            if (matched) {
                totalOrders = Number(matched.total_orders);
                totalRekonLensa = Number(matched.total_rekon_lensa);
                totalBelumRekon = Number(matched.total_belum_rekon);
            }
        }

        const persentaseRekon =
            totalOrders > 0
                ? Number(((totalRekonLensa / totalOrders) * 100).toFixed(2))
                : 0;

        const summary: KproRekonSummaryMetrics = {
            totalOrders,
            totalRekonLensa,
            totalBelumRekon,
            persentaseRekon,
        };

        const districts = districtRollup
            .map((d) => d.district_tif)
            .filter(Boolean);

        const resultData: KproRekonAnalyticsData = {
            summary,
            districtRollup,
            dailyTrend,
            districts,
            selectedDistrict: district,
            selectedDays: days,
        };

        // Cache 5 menit (300 detik)
        await encryptedCache.setGeneral('analytics', resultData, cacheKey, 300);

        return { success: true, data: resultData };
    } catch (err: unknown) {
        actionLogger.error(
            'Failed to fetch KPRO Rekon analytics:',
            err instanceof Error ? err : new Error(String(err))
        );
        return {
            success: false,
            error: 'Gagal memuat analitik K-PRO',
        };
    }
}
