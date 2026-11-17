-- Migration 064: Setup Kluster 2 and Kluster 3 Analytics Materialized Views
-- Author: MTMS Team
-- Date: 2026-11-17
-- Context: Hybrid OLTP+OLAP Phase 1B:
--   - Kluster 2: WO Lensa vs Rekon Pemakaian Material (Header & List Discrepancy & SLA)
--   - Kluster 3: Out Lensa Ref vs Out SAP (GI Number & Reservation ID Matching)
--   - Atomic procedure update for concurrent MView refresh.

-- ============================================================================
-- 1. Kluster 2: Materialized View WO Lensa vs Rekon Pemakaian Material
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_wo_lensa_rekon_summary AS
WITH rl_agg AS (
    SELECT 
        rekon_used_id, 
        designator_id, 
        SUM(qty) AS total_qty
    FROM inventory.rekon_used_list
    GROUP BY rekon_used_id, designator_id
),
wo_items_agg AS (
    SELECT 
        wl.header_id,
        COUNT(wl.id) AS total_items,
        SUM(wl.qty_pemakaian) AS total_qty_req,
        COALESCE(SUM(rl.total_qty), 0) AS total_qty_used,
        COUNT(CASE WHEN rl.total_qty IS NOT NULL AND rl.total_qty = wl.qty_pemakaian THEN 1 END) AS items_exact_match,
        COUNT(CASE WHEN rl.total_qty IS NULL OR rl.total_qty != wl.qty_pemakaian THEN 1 END) AS items_discrepancy
    FROM inventory.wo_lensa_list wl
    LEFT JOIN inventory.wo_lensa_header w ON w.id = wl.header_id
    LEFT JOIN inventory.rekon_used_header r ON r.id_pemakaian = w.pemakaian_id::text
    LEFT JOIN rl_agg rl ON rl.rekon_used_id = r.id AND rl.designator_id = wl.material_id
    GROUP BY wl.header_id
)
SELECT 
    w.formatted_date AS tgl,
    COALESCE(wh.id, 0)::int AS warehouse_id,
    COALESCE(wh.name, w.nama_gudang, 'UNKNOWN')::varchar AS warehouse_name,
    COALESCE(w.nama_gudang, 'UNKNOWN')::varchar AS nama_gudang,
    COALESCE(b.service_area, 'UNKNOWN')::varchar AS service_area,
    COUNT(w.id)::int AS total_wo,
    COUNT(CASE WHEN w.rekon_check IS TRUE OR r.id IS NOT NULL THEN 1 END)::int AS total_wo_rekon,
    COUNT(CASE WHEN (w.rekon_check IS FALSE OR w.rekon_check IS NULL) AND r.id IS NULL THEN 1 END)::int AS total_wo_pending,
    ROUND(
        (COUNT(CASE WHEN w.rekon_check IS TRUE OR r.id IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(w.id), 0)) * 100, 
        2
    ) AS persentase_rekon,
    COALESCE(SUM(wia.total_qty_req), 0)::int AS total_qty_req,
    COALESCE(SUM(wia.total_qty_used), 0)::numeric AS total_qty_used,
    COALESCE(SUM(wia.total_qty_req - wia.total_qty_used), 0)::numeric AS total_qty_selisih,
    COALESCE(SUM(wia.items_exact_match), 0)::int AS items_exact_match,
    COALESCE(SUM(wia.items_discrepancy), 0)::int AS items_discrepancy,
    COUNT(
        CASE 
            WHEN (w.rekon_check IS TRUE OR r.id IS NOT NULL) 
             AND DATE(COALESCE(r.create_at, w.created_at) AT TIME ZONE 'Asia/Jakarta') - w.formatted_date <= 1 
            THEN 1 
        END
    )::int AS count_sla_on_time,
    ROUND(
        AVG(DATE(COALESCE(r.create_at, w.created_at) AT TIME ZONE 'Asia/Jakarta') - w.formatted_date), 
        1
    ) AS avg_sla_days,
    NOW() AS refreshed_at
FROM inventory.wo_lensa_header w
LEFT JOIN inventory.mas_wh wh ON LOWER(REGEXP_REPLACE(wh.name, '\s+', '', 'g')) = LOWER(REGEXP_REPLACE(w.nama_gudang, '\s+', '', 'g'))
LEFT JOIN hr.technicians t ON t.nik = w.nik_pemakai
LEFT JOIN hr.branches b ON b.id = t.branch_id
LEFT JOIN inventory.rekon_used_header r ON r.id_pemakaian = w.pemakaian_id::text
LEFT JOIN wo_items_agg wia ON wia.header_id = w.id
WHERE w.formatted_date IS NOT NULL
GROUP BY 
    w.formatted_date, 
    COALESCE(wh.id, 0), 
    COALESCE(wh.name, w.nama_gudang, 'UNKNOWN'), 
    COALESCE(w.nama_gudang, 'UNKNOWN'), 
    COALESCE(b.service_area, 'UNKNOWN')
WITH DATA;

-- Unique Index for Concurrent Refresh on Kluster 2
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_wo_lensa_rekon_summary_uid 
ON analytics.mv_wo_lensa_rekon_summary (tgl, nama_gudang, service_area);

CREATE INDEX IF NOT EXISTS idx_mv_wo_lensa_rekon_summary_lookup 
ON analytics.mv_wo_lensa_rekon_summary (tgl DESC, warehouse_id, service_area);

-- ============================================================================
-- 2. Kluster 3: Materialized View Out SAP vs Out Lensa Ref
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_out_sap_lensa_summary AS
SELECT 
    olh.formatted_date AS tgl,
    COALESCE(wh.id, 0)::int AS warehouse_id,
    COALESCE(wh.name, olh.nama_gudang, 'UNKNOWN')::varchar AS warehouse_name,
    COALESCE(olh.nama_gudang, 'UNKNOWN')::varchar AS nama_gudang,
    COALESCE(b.service_area, 'UNKNOWN')::varchar AS service_area,
    COUNT(olh.id)::int AS total_out_lensa,
    COUNT(CASE WHEN olh.sap_out_check IS TRUE OR soh_gi.id IS NOT NULL OR soh_res.id IS NOT NULL THEN 1 END)::int AS total_matched_sap,
    COUNT(CASE WHEN (olh.sap_out_check IS FALSE OR olh.sap_out_check IS NULL) AND soh_gi.id IS NULL AND soh_res.id IS NULL THEN 1 END)::int AS total_unmatched_sap,
    COUNT(CASE WHEN soh_gi.id IS NOT NULL THEN 1 END)::int AS match_by_gi,
    COUNT(CASE WHEN soh_res.id IS NOT NULL THEN 1 END)::int AS match_by_reservasi,
    ROUND(
        (COUNT(CASE WHEN olh.sap_out_check IS TRUE OR soh_gi.id IS NOT NULL OR soh_res.id IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(olh.id), 0)) * 100, 
        2
    ) AS persentase_kecocokan,
    NOW() AS refreshed_at
FROM inventory.out_lensa_ref_header olh
LEFT JOIN inventory.mas_wh wh ON LOWER(REGEXP_REPLACE(wh.name, '\s+', '', 'g')) = LOWER(REGEXP_REPLACE(olh.nama_gudang, '\s+', '', 'g'))
LEFT JOIN hr.technicians t ON t.nik = olh.nik_pemakai
LEFT JOIN hr.branches b ON b.id = t.branch_id
LEFT JOIN inventory.sap_out_header soh_gi 
    ON NULLIF(TRIM(olh.gi_number), '') IS NOT NULL 
   AND soh_gi.sap_number = TRIM(olh.gi_number)
LEFT JOIN inventory.sap_out_header soh_res 
    ON NULLIF(TRIM(olh.reservation_id), '') IS NOT NULL 
   AND (soh_res.request_id = TRIM(olh.reservation_id) OR soh_res.id_reservasi = TRIM(olh.reservation_id))
WHERE olh.formatted_date IS NOT NULL
GROUP BY 
    olh.formatted_date, 
    COALESCE(wh.id, 0), 
    COALESCE(wh.name, olh.nama_gudang, 'UNKNOWN'), 
    COALESCE(olh.nama_gudang, 'UNKNOWN'), 
    COALESCE(b.service_area, 'UNKNOWN')
WITH DATA;

-- Unique Index for Concurrent Refresh on Kluster 3
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_out_sap_lensa_summary_uid 
ON analytics.mv_out_sap_lensa_summary (tgl, nama_gudang, service_area);

CREATE INDEX IF NOT EXISTS idx_mv_out_sap_lensa_summary_lookup 
ON analytics.mv_out_sap_lensa_summary (tgl DESC, warehouse_id, service_area);

-- ============================================================================
-- 3. Stored Procedure Update: Refresh all 3 Materialized Views Atomically
-- ============================================================================
CREATE OR REPLACE PROCEDURE analytics.sp_refresh_analytics_mviews()
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_duration_ms INT;
BEGIN
    -- Concurrently refresh all MViews without locking active dashboard readers
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_kpro_rekon_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_wo_lensa_rekon_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_out_sap_lensa_summary;

    v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000);

    -- Audit log to etl.upload_logs
    INSERT INTO etl.upload_logs (
        table_name, 
        last_updated_at, 
        updated_by, 
        created_at
    ) VALUES 
        ('analytics.mv_kpro_rekon_summary', NOW(), 1, NOW()),
        ('analytics.mv_wo_lensa_rekon_summary', NOW(), 1, NOW()),
        ('analytics.mv_out_sap_lensa_summary', NOW(), 1, NOW());

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[ANALYTICS] Failed to refresh materialized views: %', SQLERRM;
    RAISE;
END;
$$;
