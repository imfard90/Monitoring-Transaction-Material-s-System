import type { Pool } from 'pg';
import * as dbModule from '@/lib/db/db';
import { dbLogger } from '@/lib/logger';

export interface KproRekonSummaryRow {
    tgl: string | Date;
    district_tif: string;
    datel_baru: string;
    total_orders: number;
    total_rekon_lensa: number;
    total_belum_rekon: number;
    persentase_rekon: number;
    max_statusdate: string | Date | null;
    refreshed_at: string | Date;
}

export interface KproRekonDistrictRollup {
    district_tif: string;
    total_orders: number;
    total_rekon_lensa: number;
    total_belum_rekon: number;
    persentase_rekon: number;
}

export interface KproRekonDatelRollup {
    datel_baru: string;
    total_orders: number;
    total_rekon_lensa: number;
    total_belum_rekon: number;
    persentase_rekon: number;
}

export interface KproRekonDailyTrend {
    tgl: string;
    total_orders: number;
    total_rekon_lensa: number;
    total_belum_rekon: number;
    persentase_rekon: number;
}

export interface AnalyticsRepository {
    getKproRekonSummary(params?: {
        district?: string;
        datel?: string;
        days?: number;
    }): Promise<KproRekonSummaryRow[]>;
    getKproRekonDistrictRollup(params?: {
        days?: number;
    }): Promise<KproRekonDistrictRollup[]>;
    getKproRekonDatelRollup(params?: {
        district?: string;
        days?: number;
    }): Promise<KproRekonDatelRollup[]>;
    getKproRekonDailyTrend(params?: {
        district?: string;
        datel?: string;
        days?: number;
    }): Promise<KproRekonDailyTrend[]>;
    refreshAnalyticsMViews(): Promise<{ durationMs: number }>;
}

export function createAnalyticsRepository(customPool?: Pool): AnalyticsRepository {
    const getPool = (): Pool => {
        if (customPool) return customPool;
        return dbModule.pool;
    };

    return {
        /**
         * Mengambil data rincian agregasi K-PRO vs Rekon Lensa dari Materialized View
         */
        async getKproRekonSummary(params?: {
            district?: string;
            datel?: string;
            days?: number;
        }): Promise<KproRekonSummaryRow[]> {
            const pool = getPool();
            const days = params?.days ?? 90;
            const conditions: string[] = ['tgl >= CURRENT_DATE - ($1 || \' days\')::interval'];
            const values: unknown[] = [days];
            let paramIdx = 2;

            if (params?.district && params.district !== 'all') {
                conditions.push(`district_tif = $${paramIdx++}`);
                values.push(params.district);
            }

            if (params?.datel && params.datel !== 'all') {
                conditions.push(`datel_baru = $${paramIdx++}`);
                values.push(params.datel);
            }

            const query = `
                SELECT 
                    tgl,
                    district_tif,
                    datel_baru,
                    total_orders,
                    total_rekon_lensa,
                    total_belum_rekon,
                    persentase_rekon,
                    max_statusdate,
                    refreshed_at
                FROM analytics.mv_kpro_rekon_summary
                WHERE ${conditions.join(' AND ')}
                ORDER BY tgl DESC, district_tif ASC, datel_baru ASC;
            `;

            const res = await pool.query<KproRekonSummaryRow>(query, values);
            return res.rows;
        },

        /**
         * Mengambil rollup ringkasan performa per District TIF (KPI Komparasi)
         */
        async getKproRekonDistrictRollup(params?: {
            days?: number;
        }): Promise<KproRekonDistrictRollup[]> {
            const pool = getPool();
            const days = params?.days ?? 90;

            const query = `
                SELECT 
                    district_tif,
                    SUM(total_orders)::int AS total_orders,
                    SUM(total_rekon_lensa)::int AS total_rekon_lensa,
                    SUM(total_belum_rekon)::int AS total_belum_rekon,
                    ROUND(
                        (SUM(total_rekon_lensa)::numeric / NULLIF(SUM(total_orders), 0)) * 100, 
                        2
                    ) AS persentase_rekon
                FROM analytics.mv_kpro_rekon_summary
                WHERE tgl >= CURRENT_DATE - ($1 || ' days')::interval
                GROUP BY district_tif
                ORDER BY total_orders DESC;
            `;

            const res = await pool.query<KproRekonDistrictRollup>(query, [days]);
            return res.rows;
        },

        /**
         * Mengambil rollup ringkasan performa per Datel Baru / Gudang untuk suatu distrik
         */
        async getKproRekonDatelRollup(params?: {
            district?: string;
            days?: number;
        }): Promise<KproRekonDatelRollup[]> {
            const pool = getPool();
            const days = params?.days ?? 30;
            const district = params?.district ?? 'LAMONGAN';
            const conditions: string[] = ['tgl >= CURRENT_DATE - ($1 || \' days\')::interval'];
            const values: unknown[] = [days];
            let paramIdx = 2;

            if (district && district !== 'all') {
                conditions.push(`district_tif = $${paramIdx++}`);
                values.push(district);
            }

            const query = `
                SELECT 
                    datel_baru,
                    SUM(total_orders)::int AS total_orders,
                    SUM(total_rekon_lensa)::int AS total_rekon_lensa,
                    SUM(total_belum_rekon)::int AS total_belum_rekon,
                    ROUND(
                        (SUM(total_rekon_lensa)::numeric / NULLIF(SUM(total_orders), 0)) * 100, 
                        2
                    ) AS persentase_rekon
                FROM analytics.mv_kpro_rekon_summary
                WHERE ${conditions.join(' AND ')}
                GROUP BY datel_baru
                ORDER BY total_orders DESC;
            `;

            const res = await pool.query<KproRekonDatelRollup>(query, values);
            return res.rows;
        },

        /**
         * Mengambil tren harian (timeseries) untuk grafik visualisasi
         */
        async getKproRekonDailyTrend(params?: {
            district?: string;
            datel?: string;
            days?: number;
        }): Promise<KproRekonDailyTrend[]> {
            const pool = getPool();
            const days = params?.days ?? 30;
            const conditions: string[] = ['tgl >= CURRENT_DATE - ($1 || \' days\')::interval'];
            const values: unknown[] = [days];
            let paramIdx = 2;

            if (params?.district && params.district !== 'all') {
                conditions.push(`district_tif = $${paramIdx++}`);
                values.push(params.district);
            }

            if (params?.datel && params.datel !== 'all') {
                conditions.push(`datel_baru = $${paramIdx++}`);
                values.push(params.datel);
            }

            const query = `
                SELECT 
                    TO_CHAR(tgl, 'YYYY-MM-DD') AS tgl,
                    SUM(total_orders)::int AS total_orders,
                    SUM(total_rekon_lensa)::int AS total_rekon_lensa,
                    SUM(total_belum_rekon)::int AS total_belum_rekon,
                    ROUND(
                        (SUM(total_rekon_lensa)::numeric / NULLIF(SUM(total_orders), 0)) * 100, 
                        2
                    ) AS persentase_rekon
                FROM analytics.mv_kpro_rekon_summary
                WHERE ${conditions.join(' AND ')}
                GROUP BY tgl
                ORDER BY tgl ASC;
            `;

            const res = await pool.query<KproRekonDailyTrend>(query, values);
            return res.rows;
        },

        /**
         * Memicu penyegaran atomik Materialized View melalui Stored Procedure
         */
        async refreshAnalyticsMViews(): Promise<{ durationMs: number }> {
            const pool = getPool();
            const t0 = Date.now();
            dbLogger.info('[ANALYTICS-REPO] Executing analytics.sp_refresh_analytics_mviews()...');

            await pool.query('CALL analytics.sp_refresh_analytics_mviews()');

            const durationMs = Date.now() - t0;
            dbLogger.info(`[ANALYTICS-REPO] Analytics MViews refreshed in ${durationMs}ms`);
            return { durationMs };
        },
    };
}

export const analyticsRepository = createAnalyticsRepository();
