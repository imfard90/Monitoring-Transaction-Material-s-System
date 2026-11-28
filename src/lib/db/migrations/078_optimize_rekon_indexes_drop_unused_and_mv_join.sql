-- ============================================================================
-- Migration: 078_optimize_rekon_indexes_drop_unused_and_mv_join.sql
-- Description:
-- Paket C Audit Performa & Kualitas Database:
-- A. Menambahkan index pada inventory.rekon_used_header(id_pemakaian) untuk
--    mempercepat lookup wo-lensa-ref, SP ELT, dan refresh MV.
-- B. Menghapus GIN index 32 MB yang tidak terpakai pada etl.staging_data_kpro_raw.
-- C. Menghapus index redundan pada inventory.wo_lensa_header.
-- D. Mengoptimalkan join inventory.mas_wh di analytics.mv_wo_lensa_rekon_summary
--    dan analytics.mv_out_sap_lensa_summary agar menggunakan FK warehouse_id langsung.
-- ============================================================================

-- A. Index pada rekon_used_header(id_pemakaian)
CREATE INDEX IF NOT EXISTS idx_rekon_used_header_id_pemakaian
    ON inventory.rekon_used_header (id_pemakaian);

-- B. Drop unused 32 MB GIN index pada staging_data_kpro_raw
DROP INDEX IF EXISTS etl.idx_raw_data_gin;

-- C. Drop redundant indexes pada wo_lensa_header
DROP INDEX IF EXISTS inventory.idx_wo_lensa_header_nama_gudang;
DROP INDEX IF EXISTS inventory.idx_wo_lensa_header_rekon_check;

-- D. Recreate Materialized Views menggunakan warehouse_id join (tanpa regexp_replace)
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_wo_lensa_rekon_summary;
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_out_sap_lensa_summary;

CREATE MATERIALIZED VIEW analytics.mv_wo_lensa_rekon_summary AS
WITH rl_agg AS (
    SELECT
        rekon_used_list.rekon_used_id,
        rekon_used_list.designator_id,
        sum(rekon_used_list.qty) AS total_qty
    FROM inventory.rekon_used_list
    GROUP BY rekon_used_list.rekon_used_id, rekon_used_list.designator_id
),
wo_items_agg AS (
    SELECT
        wl.header_id,
        count(wl.id) AS total_items,
        sum(wl.qty_pemakaian) AS total_qty_req,
        COALESCE(sum(rl.total_qty), 0::numeric) AS total_qty_used,
        count(
            CASE
                WHEN rl.total_qty IS NOT NULL AND rl.total_qty = wl.qty_pemakaian::numeric THEN 1
                ELSE NULL::integer
            END
        ) AS items_exact_match,
        count(
            CASE
                WHEN rl.total_qty IS NULL OR rl.total_qty <> wl.qty_pemakaian::numeric THEN 1
                ELSE NULL::integer
            END
        ) AS items_discrepancy
    FROM inventory.wo_lensa_list wl
    LEFT JOIN inventory.wo_lensa_header w_1 ON w_1.id = wl.header_id
    LEFT JOIN inventory.rekon_used_header r_1 ON r_1.id_pemakaian::text = w_1.pemakaian_id::text
    LEFT JOIN rl_agg rl ON rl.rekon_used_id = r_1.id AND rl.designator_id::text = wl.material_id::text
    GROUP BY wl.header_id
)
SELECT
    w.formatted_date AS tgl,
    COALESCE(wh.id, 0) AS warehouse_id,
    COALESCE(wh.name, w.nama_gudang, 'UNKNOWN'::character varying) AS warehouse_name,
    COALESCE(w.nama_gudang, 'UNKNOWN'::character varying) AS nama_gudang,
    COALESCE(b.service_area, 'UNKNOWN'::character varying) AS service_area,
    count(w.id)::integer AS total_wo,
    count(
        CASE
            WHEN w.rekon_check IS TRUE OR r.id IS NOT NULL THEN 1
            ELSE NULL::integer
        END
    )::integer AS total_wo_rekon,
    count(
        CASE
            WHEN w.rekon_check IS FALSE AND r.id IS NULL THEN 1
            ELSE NULL::integer
        END
    )::integer AS total_wo_pending,
    round(
        count(
            CASE
                WHEN w.rekon_check IS TRUE OR r.id IS NOT NULL THEN 1
                ELSE NULL::integer
            END
        )::numeric / NULLIF(count(w.id), 0)::numeric * 100::numeric,
        2
    ) AS persentase_rekon,
    COALESCE(sum(wia.total_qty_req), 0::numeric)::integer AS total_qty_req,
    COALESCE(sum(wia.total_qty_used), 0::numeric) AS total_qty_used,
    COALESCE(sum(wia.total_qty_req::numeric - wia.total_qty_used), 0::numeric) AS total_qty_selisih,
    COALESCE(sum(wia.items_exact_match), 0::numeric)::integer AS items_exact_match,
    COALESCE(sum(wia.items_discrepancy), 0::numeric)::integer AS items_discrepancy,
    count(
        CASE
            WHEN (w.rekon_check IS TRUE OR r.id IS NOT NULL)
                 AND (date(COALESCE(r.create_at, w.created_at) AT TIME ZONE 'Asia/Jakarta'::text) - w.formatted_date) <= 1
            THEN 1
            ELSE NULL::integer
        END
    )::integer AS count_sla_on_time,
    round(
        avg(date(COALESCE(r.create_at, w.created_at) AT TIME ZONE 'Asia/Jakarta'::text) - w.formatted_date),
        1
    ) AS avg_sla_days,
    now() AS refreshed_at
FROM inventory.wo_lensa_header w
LEFT JOIN inventory.mas_wh wh ON wh.id = w.warehouse_id
LEFT JOIN hr.technicians t ON t.nik::text = w.nik_pemakai::text
LEFT JOIN hr.branches b ON b.id = t.branch_id
LEFT JOIN inventory.rekon_used_header r ON r.id_pemakaian::text = w.pemakaian_id::text
LEFT JOIN wo_items_agg wia ON wia.header_id = w.id
WHERE w.formatted_date IS NOT NULL
GROUP BY
    w.formatted_date,
    COALESCE(wh.id, 0),
    COALESCE(wh.name, w.nama_gudang, 'UNKNOWN'::character varying),
    COALESCE(w.nama_gudang, 'UNKNOWN'::character varying),
    COALESCE(b.service_area, 'UNKNOWN'::character varying);

CREATE UNIQUE INDEX idx_mv_wo_lensa_rekon_summary_uid
    ON analytics.mv_wo_lensa_rekon_summary (tgl, nama_gudang, service_area);
CREATE INDEX idx_mv_wo_lensa_rekon_summary_lookup
    ON analytics.mv_wo_lensa_rekon_summary (tgl DESC, warehouse_id, service_area);

CREATE MATERIALIZED VIEW analytics.mv_out_sap_lensa_summary AS
SELECT
    olh.formatted_date AS tgl,
    COALESCE(wh.id, 0) AS warehouse_id,
    COALESCE(wh.name, olh.nama_gudang, 'UNKNOWN'::character varying) AS warehouse_name,
    COALESCE(olh.nama_gudang, 'UNKNOWN'::character varying) AS nama_gudang,
    COALESCE(b.service_area, 'UNKNOWN'::character varying) AS service_area,
    count(olh.id)::integer AS total_out_lensa,
    count(
        CASE
            WHEN olh.sap_out_check IS TRUE OR soh_gi.id IS NOT NULL OR soh_res.id IS NOT NULL THEN 1
            ELSE NULL::integer
        END
    )::integer AS total_matched_sap,
    count(
        CASE
            WHEN olh.sap_out_check IS FALSE AND soh_gi.id IS NULL AND soh_res.id IS NULL THEN 1
            ELSE NULL::integer
        END
    )::integer AS total_unmatched_sap,
    count(
        CASE
            WHEN soh_gi.id IS NOT NULL THEN 1
            ELSE NULL::integer
        END
    )::integer AS match_by_gi,
    count(
        CASE
            WHEN soh_res.id IS NOT NULL THEN 1
            ELSE NULL::integer
        END
    )::integer AS match_by_reservasi,
    round(
        count(
            CASE
                WHEN olh.sap_out_check IS TRUE OR soh_gi.id IS NOT NULL OR soh_res.id IS NOT NULL THEN 1
                ELSE NULL::integer
            END
        )::numeric / NULLIF(count(olh.id), 0)::numeric * 100::numeric,
        2
    ) AS persentase_kecocokan,
    now() AS refreshed_at
FROM inventory.out_lensa_ref_header olh
LEFT JOIN inventory.mas_wh wh ON wh.id = olh.warehouse_id
LEFT JOIN hr.technicians t ON t.nik::text = olh.nik_pemakai::text
LEFT JOIN hr.branches b ON b.id = t.branch_id
LEFT JOIN inventory.sap_out_header soh_gi
    ON NULLIF(TRIM(BOTH FROM olh.gi_number), ''::text) IS NOT NULL
   AND soh_gi.sap_number::text = TRIM(BOTH FROM olh.gi_number)
LEFT JOIN inventory.sap_out_header soh_res
    ON NULLIF(TRIM(BOTH FROM olh.reservation_id), ''::text) IS NOT NULL
   AND (soh_res.request_id::text = TRIM(BOTH FROM olh.reservation_id) OR soh_res.id_reservasi::text = TRIM(BOTH FROM olh.reservation_id))
WHERE olh.formatted_date IS NOT NULL
GROUP BY
    olh.formatted_date,
    COALESCE(wh.id, 0),
    COALESCE(wh.name, olh.nama_gudang, 'UNKNOWN'::character varying),
    COALESCE(olh.nama_gudang, 'UNKNOWN'::character varying),
    COALESCE(b.service_area, 'UNKNOWN'::character varying);

CREATE UNIQUE INDEX idx_mv_out_sap_lensa_summary_uid
    ON analytics.mv_out_sap_lensa_summary (tgl, nama_gudang, service_area);
CREATE INDEX idx_mv_out_sap_lensa_summary_lookup
    ON analytics.mv_out_sap_lensa_summary (tgl DESC, warehouse_id, service_area);
