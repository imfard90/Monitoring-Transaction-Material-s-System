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

export interface WarehouseMetricRow {
    key: number | string;
    name: string;
    total: number;
    completed: number;
}

export interface WoLensaRekonSummaryRow {
    tgl: string | Date;
    warehouse_id: number;
    warehouse_name: string;
    nama_gudang: string;
    service_area: string;
    total_wo: number;
    total_wo_rekon: number;
    total_wo_pending: number;
    persentase_rekon: number;
    total_qty_req: number;
    total_qty_used: number;
    total_qty_selisih: number;
    items_exact_match: number;
    items_discrepancy: number;
    count_sla_on_time: number;
    avg_sla_days: number;
    refreshed_at: string | Date;
}

export interface OutLensaSapSummaryRow {
    tgl: string | Date;
    warehouse_id: number;
    warehouse_name: string;
    nama_gudang: string;
    service_area: string;
    total_out_lensa: number;
    total_matched_sap: number;
    total_unmatched_sap: number;
    match_by_gi: number;
    match_by_reservasi: number;
    persentase_kecocokan: number;
    refreshed_at: string | Date;
}

export interface AnalyticsRepository {
    getKproRekonSummary(params?: {
        district?: string;
        datel?: string;
        days?: number;
    }): Promise<KproRekonSummaryRow[]>;
    getKproRekonDistrictRollup(params?: { days?: number }): Promise<KproRekonDistrictRollup[]>;
    getKproRekonDatelRollup(params?: {
        district?: string;
        days?: number;
    }): Promise<KproRekonDatelRollup[]>;
    getKproRekonDailyTrend(params?: {
        district?: string;
        datel?: string;
        days?: number;
    }): Promise<KproRekonDailyTrend[]>;
    getLensaOutPerformance(
        days?: number,
        groupBy?: 'warehouse' | 'service_area'
    ): Promise<WarehouseMetricRow[]>;
    getLensaRekonPerformance(
        days?: number,
        groupBy?: 'warehouse' | 'service_area'
    ): Promise<{
        rekon: WarehouseMetricRow[];
        slaRekon: WarehouseMetricRow[];
    }>;
    getWoLensaRekonSummary(params?: {
        warehouseId?: number;
        serviceArea?: string;
        days?: number;
    }): Promise<WoLensaRekonSummaryRow[]>;
    getOutLensaSapSummary(params?: {
        warehouseId?: number;
        serviceArea?: string;
        days?: number;
    }): Promise<OutLensaSapSummaryRow[]>;
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
            const conditions: string[] = ["tgl >= CURRENT_DATE - ($1 || ' days')::interval"];
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
            const conditions: string[] = ["tgl >= CURRENT_DATE - ($1 || ' days')::interval"];
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
            const conditions: string[] = ["tgl >= CURRENT_DATE - ($1 || ' days')::interval"];
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
         * Mengambil ringkasan performa Out Lensa per Gudang atau Service Area dari Materialized View (Kluster 3)
         */
        async getLensaOutPerformance(
            days: number = 30,
            groupBy: 'warehouse' | 'service_area' = 'warehouse'
        ): Promise<WarehouseMetricRow[]> {
            const pool = getPool();
            const isServiceArea = groupBy === 'service_area';

            const query = isServiceArea
                ? `
                    SELECT 
                        service_area AS key,
                        service_area AS name,
                        SUM(total_out_lensa)::int AS total,
                        SUM(total_matched_sap)::int AS completed
                    FROM analytics.mv_out_sap_lensa_summary
                    WHERE tgl >= CURRENT_DATE - ($1 || ' days')::interval
                      AND tgl <= CURRENT_DATE
                      AND service_area IS NOT NULL
                      AND service_area <> 'UNKNOWN'
                    GROUP BY service_area
                    ORDER BY service_area ASC;
                `
                : `
                    SELECT 
                        warehouse_id AS key,
                        warehouse_name AS name,
                        SUM(total_out_lensa)::int AS total,
                        SUM(total_matched_sap)::int AS completed
                    FROM analytics.mv_out_sap_lensa_summary
                    WHERE tgl >= CURRENT_DATE - ($1 || ' days')::interval
                      AND tgl <= CURRENT_DATE
                      AND warehouse_id > 0
                    GROUP BY warehouse_id, warehouse_name
                    ORDER BY warehouse_name ASC;
                `;

            const res = await pool.query<WarehouseMetricRow>(query, [days]);
            return res.rows;
        },

        /**
         * Mengambil ringkasan performa Rekon Lensa dan SLA Rekon per Gudang atau Service Area dari Materialized View (Kluster 2)
         */
        async getLensaRekonPerformance(
            days: number = 30,
            groupBy: 'warehouse' | 'service_area' = 'warehouse'
        ): Promise<{
            rekon: WarehouseMetricRow[];
            slaRekon: WarehouseMetricRow[];
        }> {
            const pool = getPool();
            const isServiceArea = groupBy === 'service_area';

            const query = isServiceArea
                ? `
                    SELECT 
                        service_area AS key,
                        service_area AS name,
                        SUM(total_wo)::int AS total_wo,
                        SUM(total_wo_rekon)::int AS completed_rekon,
                        SUM(count_sla_on_time)::int AS completed_sla
                    FROM analytics.mv_wo_lensa_rekon_summary
                    WHERE tgl >= CURRENT_DATE - ($1 || ' days')::interval
                      AND tgl <= CURRENT_DATE
                      AND service_area IS NOT NULL
                      AND service_area <> 'UNKNOWN'
                    GROUP BY service_area
                    ORDER BY service_area ASC;
                `
                : `
                    SELECT 
                        warehouse_id AS key,
                        warehouse_name AS name,
                        SUM(total_wo)::int AS total_wo,
                        SUM(total_wo_rekon)::int AS completed_rekon,
                        SUM(count_sla_on_time)::int AS completed_sla
                    FROM analytics.mv_wo_lensa_rekon_summary
                    WHERE tgl >= CURRENT_DATE - ($1 || ' days')::interval
                      AND tgl <= CURRENT_DATE
                      AND warehouse_id > 0
                    GROUP BY warehouse_id, warehouse_name
                    ORDER BY warehouse_name ASC;
                `;

            const res = await pool.query<{
                key: number | string;
                name: string;
                total_wo: number;
                completed_rekon: number;
                completed_sla: number;
            }>(query, [days]);

            const rekon: WarehouseMetricRow[] = res.rows.map((row) => ({
                key: row.key,
                name: row.name,
                total: Number(row.total_wo),
                completed: Number(row.completed_rekon),
            }));

            const slaRekon: WarehouseMetricRow[] = res.rows.map((row) => ({
                key: row.key,
                name: row.name,
                total: Number(row.completed_rekon),
                completed: Number(row.completed_sla),
            }));

            return { rekon, slaRekon };
        },

        /**
         * Mengambil rincian WO Lensa vs Rekon Pemakaian Material (Kluster 2)
         */
        async getWoLensaRekonSummary(params?: {
            warehouseId?: number;
            serviceArea?: string;
            days?: number;
        }): Promise<WoLensaRekonSummaryRow[]> {
            const pool = getPool();
            const days = params?.days ?? 30;
            const conditions: string[] = [
                "tgl >= CURRENT_DATE - ($1 || ' days')::interval",
                'tgl <= CURRENT_DATE',
            ];
            const values: unknown[] = [days];
            let paramIdx = 2;

            if (params?.warehouseId && params.warehouseId > 0) {
                conditions.push(`warehouse_id = $${paramIdx++}`);
                values.push(params.warehouseId);
            }

            if (params?.serviceArea && params.serviceArea !== 'all') {
                conditions.push(`service_area = $${paramIdx++}`);
                values.push(params.serviceArea);
            }

            const query = `
                SELECT 
                    tgl,
                    warehouse_id,
                    warehouse_name,
                    nama_gudang,
                    service_area,
                    total_wo,
                    total_wo_rekon,
                    total_wo_pending,
                    persentase_rekon,
                    total_qty_req,
                    total_qty_used,
                    total_qty_selisih,
                    items_exact_match,
                    items_discrepancy,
                    count_sla_on_time,
                    avg_sla_days,
                    refreshed_at
                FROM analytics.mv_wo_lensa_rekon_summary
                WHERE ${conditions.join(' AND ')}
                ORDER BY tgl DESC, warehouse_name ASC, service_area ASC;
            `;

            const res = await pool.query<WoLensaRekonSummaryRow>(query, values);
            return res.rows;
        },

        /**
         * Mengambil rincian Out Lensa vs SAP Out (Kluster 3)
         */
        async getOutLensaSapSummary(params?: {
            warehouseId?: number;
            serviceArea?: string;
            days?: number;
        }): Promise<OutLensaSapSummaryRow[]> {
            const pool = getPool();
            const days = params?.days ?? 30;
            const conditions: string[] = [
                "tgl >= CURRENT_DATE - ($1 || ' days')::interval",
                'tgl <= CURRENT_DATE',
            ];
            const values: unknown[] = [days];
            let paramIdx = 2;

            if (params?.warehouseId && params.warehouseId > 0) {
                conditions.push(`warehouse_id = $${paramIdx++}`);
                values.push(params.warehouseId);
            }

            if (params?.serviceArea && params.serviceArea !== 'all') {
                conditions.push(`service_area = $${paramIdx++}`);
                values.push(params.serviceArea);
            }

            const query = `
                SELECT 
                    tgl,
                    warehouse_id,
                    warehouse_name,
                    nama_gudang,
                    service_area,
                    total_out_lensa,
                    total_matched_sap,
                    total_unmatched_sap,
                    match_by_gi,
                    match_by_reservasi,
                    persentase_kecocokan,
                    refreshed_at
                FROM analytics.mv_out_sap_lensa_summary
                WHERE ${conditions.join(' AND ')}
                ORDER BY tgl DESC, warehouse_name ASC, service_area ASC;
            `;

            const res = await pool.query<OutLensaSapSummaryRow>(query, values);
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
