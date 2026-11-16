'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptedCache } from '@/lib/cache/encryptedCache';
import { errors } from '@/lib/errors';
import { actionLogger } from '@/lib/logger';
import { analyticsRepository } from '@/lib/repositories';

// Pemetaan Datel Baru K-PRO ke Nama Gudang Fisik MTMS (Branch Lamongan)
const DATEL_WAREHOUSE_MAP: Record<string, string> = {
    GRESIK: 'SO Gresik',
    BJNEGORO: 'SO Bojonegoro',
    'SBY UTARA': 'SO Karangpilang',
    LAMONGAN: 'SO Lamongan',
    TUBAN: 'SO Tuban',
};

const getKproRekonAnalyticsSchema = z.object({
    days: z.number().int().min(1).max(365).default(30),
    warehouse: z.string().trim().default('all'),
});

export interface KproRekonSummaryMetrics {
    totalOrders: number;
    totalRekonLensa: number;
    totalBelumRekon: number;
    persentaseRekon: number;
}

export interface KproRekonWarehouseItem {
    datel: string;
    warehouseName: string;
    total_orders: number;
    total_rekon_lensa: number;
    total_belum_rekon: number;
    persentase_rekon: number;
}

export interface KproRekonAnalyticsData {
    district: string;
    summary: KproRekonSummaryMetrics;
    warehouseRollup: KproRekonWarehouseItem[];
    dailyTrend: Array<{
        tgl: string;
        total_orders: number;
        total_rekon_lensa: number;
        total_belum_rekon: number;
        persentase_rekon: number;
    }>;
    warehouses: Array<{ datel: string; name: string }>;
    selectedWarehouse: string;
    selectedDays: number;
}

/**
 * Server action untuk mengambil data analitik agregasi K-PRO vs Rekon Lensa
 * Khusus cakupan operasional MTMS (District Lamongan) per gudang/datel.
 */
export async function getKproRekonAnalytics(inputParams?: {
    days?: number;
    warehouse?: string;
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

    const { days, warehouse } = parsed.data;
    const districtScope = 'LAMONGAN';

    try {
        const cacheKey = `kpro_rekon_lamongan_${days}_${warehouse.toLowerCase()}`;
        const cached = await encryptedCache.getGeneral<KproRekonAnalyticsData>('analytics', cacheKey);
        if (cached) {
            return { success: true, data: cached };
        }

        // 1. Ambil rollup performa per datel/gudang untuk Distrik Lamongan
        const datelRollupRaw = await analyticsRepository.getKproRekonDatelRollup({
            district: districtScope,
            days,
        });

        const warehouseRollup: KproRekonWarehouseItem[] = datelRollupRaw.map((row) => ({
            datel: row.datel_baru,
            warehouseName: DATEL_WAREHOUSE_MAP[row.datel_baru.toUpperCase()] ?? row.datel_baru,
            total_orders: Number(row.total_orders),
            total_rekon_lensa: Number(row.total_rekon_lensa),
            total_belum_rekon: Number(row.total_belum_rekon),
            persentase_rekon: Number(row.persentase_rekon),
        }));

        // 2. Ambil tren harian untuk Distrik Lamongan (opsional terfilter gudang tertentu)
        const dailyTrend = await analyticsRepository.getKproRekonDailyTrend({
            district: districtScope,
            datel: warehouse === 'all' ? undefined : warehouse,
            days,
        });

        // 3. Hitung ringkasan metrik KPI untuk Distrik Lamongan / Gudang terpilih
        let totalOrders = 0;
        let totalRekonLensa = 0;
        let totalBelumRekon = 0;

        if (warehouse === 'all') {
            for (const item of warehouseRollup) {
                totalOrders += item.total_orders;
                totalRekonLensa += item.total_rekon_lensa;
                totalBelumRekon += item.total_belum_rekon;
            }
        } else {
            const matched = warehouseRollup.find(
                (w) => w.datel.toUpperCase() === warehouse.toUpperCase()
            );
            if (matched) {
                totalOrders = matched.total_orders;
                totalRekonLensa = matched.total_rekon_lensa;
                totalBelumRekon = matched.total_belum_rekon;
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

        const warehouseList = warehouseRollup.map((w) => ({
            datel: w.datel,
            name: w.warehouseName,
        }));

        const resultData: KproRekonAnalyticsData = {
            district: districtScope,
            summary,
            warehouseRollup,
            dailyTrend,
            warehouses: warehouseList,
            selectedWarehouse: warehouse,
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
