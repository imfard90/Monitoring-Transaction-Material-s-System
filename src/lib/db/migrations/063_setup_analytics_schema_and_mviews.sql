-- Migration 063: Setup Analytics Schema, Materialized Views, BRIN Indexes, and Refresh Procedure
-- Author: MTMS Team
-- Date: 2026-11-17
-- Context: Hybrid OLTP+OLAP Phase 1A (Quick Wins) - pre-aggregating K-PRO vs Rekon Lensa summary
-- and establishing BRIN indexes for high-volume time-series tables.

-- 1. Create Dedicated Analytics Schema
CREATE SCHEMA IF NOT EXISTS analytics;

-- 2. Create Materialized View for K-PRO vs Rekon Lensa Summary
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_kpro_rekon_summary AS
SELECT 
    date_trunc('day', k.statusdate AT TIME ZONE 'Asia/Jakarta')::date AS tgl,
    COALESCE(k.district_tif, 'UNKNOWN')::varchar AS district_tif,
    COALESCE(k.datel_baru, 'UNKNOWN')::varchar AS datel_baru,
    COUNT(k.id)::int AS total_orders,
    COUNT(CASE WHEN r.id IS NOT NULL THEN 1 END)::int AS total_rekon_lensa,
    COUNT(CASE WHEN r.id IS NULL THEN 1 END)::int AS total_belum_rekon,
    ROUND(
        (COUNT(CASE WHEN r.id IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(k.id), 0)) * 100, 
        2
    ) AS persentase_rekon,
    MAX(k.statusdate) AS max_statusdate,
    NOW() AS refreshed_at
FROM public.data_kpro k
LEFT JOIN LATERAL (
    SELECT ruh.id 
    FROM inventory.rekon_used_header ruh
    WHERE ruh.wo_number = split_part(k.scorderno, '_', 1) 
       OR ruh.wo_number = k.scorderno
    LIMIT 1
) r ON true
WHERE k.statusdate IS NOT NULL
GROUP BY 
    date_trunc('day', k.statusdate AT TIME ZONE 'Asia/Jakarta')::date,
    COALESCE(k.district_tif, 'UNKNOWN'),
    COALESCE(k.datel_baru, 'UNKNOWN')
WITH DATA;

-- 3. Unique Index to Support Atomic Concurrent Refresh (ACID Isolation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpro_rekon_summary_uid 
ON analytics.mv_kpro_rekon_summary (tgl, district_tif, datel_baru);

-- 4. Fast Lookup Index for Range Scans and Filtering
CREATE INDEX IF NOT EXISTS idx_mv_kpro_rekon_summary_tgl_district 
ON analytics.mv_kpro_rekon_summary (tgl DESC, district_tif);

-- 5. BRIN (Block Range Index) for Append-Only Time-Series Tables
-- BRIN consumes ~1% storage of B-Tree and accelerates chronological range scans
CREATE INDEX IF NOT EXISTS idx_brin_stock_movement_created_at 
ON inventory.stock_movement USING brin (created_at);

CREATE INDEX IF NOT EXISTS idx_brin_kpro_created_at 
ON public.data_kpro USING brin (created_at);

-- 6. Stored Procedure for Safe Atomic Refresh of Materialized Views
CREATE OR REPLACE PROCEDURE analytics.sp_refresh_analytics_mviews()
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_duration_ms INT;
BEGIN
    -- Refresh MView concurrently so operational readers are never locked
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_kpro_rekon_summary;

    v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000);

    -- Log successful refresh into etl.upload_logs
    INSERT INTO etl.upload_logs (
        table_name, 
        last_updated_at, 
        updated_by, 
        created_at
    ) VALUES (
        'analytics.mv_kpro_rekon_summary', 
        NOW(), 
        1, 
        NOW()
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[ANALYTICS] Failed to refresh materialized views: %', SQLERRM;
    RAISE;
END;
$$;
