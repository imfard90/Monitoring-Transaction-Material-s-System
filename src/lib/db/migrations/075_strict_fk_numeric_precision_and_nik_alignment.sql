-- ============================================================================
-- Migration: 075_strict_fk_numeric_precision_and_nik_alignment.sql
-- Description:
-- Tahap 2 & 3 Audit Kepatuhan Tipe Data Strict:
-- 1. Menyelaraskan tipe FK designator_id (bigint -> integer) agar identik dengan inventory.materials(id).
-- 2. Menegakkan precision & scale pada kolom numeric (rekon_used_list, etl.*).
-- 3. Mengonversi qty_approve pada out_lensa_ref_list_archive dari varchar(50) -> numeric(10,2).
-- 4. Menyeragamkan seluruh kolom NIK lintas schema (auth, etl, inventory) ke varchar(20).
-- 5. Drop & recreate Materialized Views di schema analytics secara atomik beserta index-nya.
-- ============================================================================

-- 1. Drop Materialized Views yang bergantung pada kolom yang akan diubah tipenya
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_wo_lensa_rekon_summary;
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_out_sap_lensa_summary;

-- 2. Prioritas Tinggi: Selaraskan FK designator_id (bigint -> integer) dengan inventory.materials(id)
ALTER TABLE inventory.inout_tag_items ALTER COLUMN designator_id TYPE integer;
ALTER TABLE inventory.sap_out_items ALTER COLUMN designator_id TYPE integer;
ALTER TABLE inventory.transaction_used_item ALTER COLUMN designator_id TYPE integer;

-- 3. Prioritas Tinggi: Precision & scale pada kolom numeric
ALTER TABLE inventory.rekon_used_list
    ALTER COLUMN qty TYPE numeric(10,2),
    ALTER COLUMN unit_price TYPE numeric(12,2);

ALTER TABLE etl.data_rfc_material_clean
    ALTER COLUMN quantity TYPE numeric(12,2);

ALTER TABLE etl.data_sap_finance_tree_clean
    ALTER COLUMN actual_cost TYPE numeric(16,2),
    ALTER COLUMN actual_revenue TYPE numeric(16,2),
    ALTER COLUMN budget TYPE numeric(16,2),
    ALTER COLUMN cost_commitment TYPE numeric(16,2),
    ALTER COLUMN proj_cost_plan TYPE numeric(16,2),
    ALTER COLUMN release TYPE numeric(16,2);

ALTER TABLE etl.data_kpro_clean
    ALTER COLUMN lat_inst_ut TYPE numeric(11,7),
    ALTER COLUMN lat_retag_ut TYPE numeric(11,7),
    ALTER COLUMN latitude_ins TYPE numeric(11,7),
    ALTER COLUMN long_inst_ut TYPE numeric(11,7),
    ALTER COLUMN long_retag_ut TYPE numeric(11,7),
    ALTER COLUMN longitude_ins TYPE numeric(11,7);

-- 4. Prioritas Tinggi: Archive qty_approve varchar(50) -> numeric(10,2)
ALTER TABLE inventory.out_lensa_ref_list_archive
    ALTER COLUMN qty_approve TYPE numeric(10,2)
    USING NULLIF(TRIM(qty_approve), '')::numeric(10,2);

-- 5. Prioritas Ringan: Standarisasi panjang kolom NIK lintas schema ke varchar(20)
ALTER TABLE inventory.return_material_header
    ALTER COLUMN nik_teknisi TYPE varchar(20),
    ALTER COLUMN nik_accept TYPE varchar(20);

ALTER TABLE inventory.inout_tag_header
    ALTER COLUMN nik_accept TYPE varchar(20);

ALTER TABLE inventory.rekon_used_header
    ALTER COLUMN nik_teknisi TYPE varchar(20);

ALTER TABLE inventory.out_lensa_ref_header
    ALTER COLUMN nik_pemakai TYPE varchar(20);

ALTER TABLE inventory.out_lensa_ref_header_archive
    ALTER COLUMN nik_pemakai TYPE varchar(20);

ALTER TABLE inventory.wo_lensa_header
    ALTER COLUMN nik_pemakai TYPE varchar(20);

ALTER TABLE inventory.wo_lensa_header_archive
    ALTER COLUMN nik_pemakai TYPE varchar(20);

ALTER TABLE auth."user"
    ALTER COLUMN nik TYPE varchar(20);

ALTER TABLE auth.auth_audit_logs
    ALTER COLUMN nik TYPE varchar(20);

ALTER TABLE etl.data_rfc_material_clean
    ALTER COLUMN nik_pemakai TYPE varchar(20);

-- 6. Recreate Materialized Views di schema analytics beserta unique & lookup indexes
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
            WHEN (w.rekon_check IS FALSE OR w.rekon_check IS NULL) AND r.id IS NULL THEN 1
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
LEFT JOIN inventory.mas_wh wh
    ON lower(regexp_replace(wh.name::text, '\s+'::text, ''::text, 'g'::text)) = lower(regexp_replace(w.nama_gudang::text, '\s+'::text, ''::text, 'g'::text))
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
            WHEN (olh.sap_out_check IS FALSE OR olh.sap_out_check IS NULL) AND soh_gi.id IS NULL AND soh_res.id IS NULL THEN 1
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
LEFT JOIN inventory.mas_wh wh
    ON lower(regexp_replace(wh.name::text, '\s+'::text, ''::text, 'g'::text)) = lower(regexp_replace(olh.nama_gudang::text, '\s+'::text, ''::text, 'g'::text))
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
