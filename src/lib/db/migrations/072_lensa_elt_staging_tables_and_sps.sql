-- Migration 072: Lensa Database-Centric ELT Staging Tables, Schema Normalization, and Stored Procedures
-- Memenuhi ADR-007: Mengalihkan pipeline scraping Out Lensa & WO Lensa dari in-memory ETL (V8) ke ELT Database-Centric.

-- ==============================================================================
-- 1. SKEMA etl & TABEL STAGING (PENYANGGA PAYLOAD MENTAH)
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS etl;

-- 1.1 Tabel Penyangga Mentah: Out Lensa Ref
CREATE TABLE IF NOT EXISTS etl.stg_out_lensa_raw (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL,
    source_action VARCHAR(20) NOT NULL DEFAULT 'system',    -- 'system' (cron) atau 'manual'
    source_system VARCHAR(50) NOT NULL DEFAULT 'LENSA_OUT',
    regional VARCHAR(50) NOT NULL DEFAULT 'REGIONAL-5',
    branch_id VARCHAR(50),
    service_area VARCHAR(50),
    sto_code VARCHAR(50),
    raw_payload JSONB NOT NULL,
    record_count INT DEFAULT 0,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',          -- 'PENDING', 'PROCESSED', 'FAILED'
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stg_out_lensa_status_batch ON etl.stg_out_lensa_raw (status, batch_id);
CREATE INDEX IF NOT EXISTS idx_stg_out_lensa_hierarchy ON etl.stg_out_lensa_raw (regional, branch_id);

-- 1.2 Tabel Penyangga Mentah: WO Lensa Ref
CREATE TABLE IF NOT EXISTS etl.stg_wo_lensa_raw (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL,
    source_action VARCHAR(20) NOT NULL DEFAULT 'system',
    source_system VARCHAR(50) NOT NULL DEFAULT 'LENSA_WO',
    regional VARCHAR(50) NOT NULL DEFAULT 'REGIONAL-5',
    branch_id VARCHAR(50),
    service_area VARCHAR(50),
    sto_code VARCHAR(50),
    raw_payload JSONB NOT NULL,
    record_count INT DEFAULT 0,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stg_wo_lensa_status_batch ON etl.stg_wo_lensa_raw (status, batch_id);
CREATE INDEX IF NOT EXISTS idx_stg_wo_lensa_hierarchy ON etl.stg_wo_lensa_raw (regional, branch_id);

-- 1.3 Aktifkan RLS pada tabel staging (L4 Compliance)
ALTER TABLE etl.stg_out_lensa_raw ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stg_out_lensa_raw_select_policy ON etl.stg_out_lensa_raw;
CREATE POLICY stg_out_lensa_raw_select_policy ON etl.stg_out_lensa_raw FOR SELECT USING (true);
DROP POLICY IF EXISTS stg_out_lensa_raw_all_policy ON etl.stg_out_lensa_raw;
CREATE POLICY stg_out_lensa_raw_all_policy ON etl.stg_out_lensa_raw FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE etl.stg_wo_lensa_raw ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stg_wo_lensa_raw_select_policy ON etl.stg_wo_lensa_raw;
CREATE POLICY stg_wo_lensa_raw_select_policy ON etl.stg_wo_lensa_raw FOR SELECT USING (true);
DROP POLICY IF EXISTS stg_wo_lensa_raw_all_policy ON etl.stg_wo_lensa_raw;
CREATE POLICY stg_wo_lensa_raw_all_policy ON etl.stg_wo_lensa_raw FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 2. NORMALISASI STRUKTUR & TIPE DATA STRICT TABEL PRODUKSI
-- ==============================================================================

-- 2.1 Out Lensa Header: Tambahkan FK warehouse_id & Backfill dari inventory.warehouse_alias
ALTER TABLE inventory.out_lensa_ref_header 
    ADD COLUMN IF NOT EXISTS warehouse_id INT REFERENCES inventory.mas_wh(id) ON DELETE SET NULL;

UPDATE inventory.out_lensa_ref_header h
SET warehouse_id = a.warehouse_id
FROM inventory.warehouse_alias a
WHERE h.warehouse_id IS NULL
  AND LOWER(TRIM(a.alias_name)) = LOWER(TRIM(h.nama_gudang));

CREATE INDEX IF NOT EXISTS idx_out_lensa_wh_id ON inventory.out_lensa_ref_header (warehouse_id);

-- 2.2 Out Lensa List (Detail): Tambahkan qty_req & Ubah qty_approve menjadi NUMERIC(10,2)
ALTER TABLE inventory.out_lensa_ref_list 
    ADD COLUMN IF NOT EXISTS qty_req NUMERIC(10,2) DEFAULT NULL;

ALTER TABLE inventory.out_lensa_ref_list 
    ALTER COLUMN qty_approve TYPE NUMERIC(10,2) 
    USING (NULLIF(REGEXP_REPLACE(qty_approve::text, '[^0-9.]', '', 'g'), '')::NUMERIC(10,2));

-- 2.3 WO Lensa Header: Tambahkan FK warehouse_id & Backfill dari inventory.warehouse_alias
ALTER TABLE inventory.wo_lensa_header 
    ADD COLUMN IF NOT EXISTS warehouse_id INT REFERENCES inventory.mas_wh(id) ON DELETE SET NULL;

UPDATE inventory.wo_lensa_header h
SET warehouse_id = a.warehouse_id
FROM inventory.warehouse_alias a
WHERE h.warehouse_id IS NULL
  AND LOWER(TRIM(a.alias_name)) = LOWER(TRIM(h.nama_gudang));

CREATE INDEX IF NOT EXISTS idx_wo_lensa_wh_id ON inventory.wo_lensa_header (warehouse_id);

-- ==============================================================================
-- 3. STORED PROCEDURE: TRANSFORMATION & NORMALISASI OUT LENSA
-- ==============================================================================

CREATE OR REPLACE PROCEDURE inventory.sp_process_stg_out_lensa(
    p_batch_id UUID,
    OUT p_processed_count INT,
    OUT p_error_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_raw INT;
BEGIN
    p_processed_count := 0;
    p_error_count := 0;

    -- 1. Validasi keberadaan batch di staging
    SELECT COUNT(*) INTO v_total_raw
    FROM etl.stg_out_lensa_raw
    WHERE batch_id = p_batch_id AND status = 'PENDING';

    IF v_total_raw = 0 THEN
        RETURN;
    END IF;

    -- 2. Parsing raw payload
    CREATE TEMPORARY TABLE tmp_stg_out_headers ON COMMIT DROP AS
    WITH unnested_elements AS (
        SELECT 
            s.id AS stg_id,
            s.regional AS stg_regional,
            elem
        FROM etl.stg_out_lensa_raw s,
             jsonb_array_elements(
                 CASE 
                     WHEN jsonb_typeof(s.raw_payload) = 'array' THEN s.raw_payload
                     ELSE jsonb_build_array(s.raw_payload)
                 END
             ) AS elem
        WHERE s.batch_id = p_batch_id AND s.status = 'PENDING'
    )
    SELECT
        stg_id,
        TRIM(elem->>'reservation_id') AS reservation_id,
        NULLIF(TRIM(elem->>'tgl_entry'), '') AS tgl_entry,
        COALESCE(
            NULLIF(TRIM(elem->>'formatted_date'), '')::DATE,
            CASE 
                WHEN elem->>'tgl_entry' ~ '^\d{4}-\d{2}-\d{2}' THEN (elem->>'tgl_entry')::DATE
                WHEN elem->>'tgl_entry' ~ '^\d{2}-\d{2}-\d{4}' THEN to_date(SUBSTRING(elem->>'tgl_entry' FROM 1 FOR 10), 'DD-MM-YYYY')
                ELSE CURRENT_DATE
            END
        ) AS formatted_date,
        NULLIF(TRIM(elem->>'nama_gudang'), '') AS nama_gudang,
        COALESCE(NULLIF(TRIM(elem->>'regional'), ''), stg_regional, 'REGIONAL-5') AS regional,
        NULLIF(TRIM(elem->>'project_id'), '') AS project_id,
        NULLIF(TRIM(elem->>'mitra'), '') AS mitra,
        NULLIF(TRIM(elem->>'nik_pemakai'), '') AS nik_pemakai,
        NULLIF(TRIM(elem->>'reservation_id_sap'), '') AS reservation_id_sap,
        NULLIF(TRIM(elem->>'scraped_by_username'), '') AS scraped_by_username,
        NULLIF(TRIM(elem->>'gi_number'), '') AS gi_number,
        NULLIF(TRIM(elem->>'status_proses'), '') AS status_proses,
        elem->'items' AS items_payload
    FROM unnested_elements
    WHERE NULLIF(TRIM(elem->>'reservation_id'), '') IS NOT NULL;

    -- 3. Catat anomali alias gudang baru ke inventory.unmapped_alias_log
    INSERT INTO inventory.unmapped_alias_log (alias_type, raw_value, source_system, regional)
    SELECT DISTINCT 'WAREHOUSE', t.nama_gudang, 'LENSA_OUT', t.regional
    FROM tmp_stg_out_headers t
    WHERE t.nama_gudang IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM inventory.warehouse_alias wa
          WHERE LOWER(TRIM(wa.alias_name)) = LOWER(TRIM(t.nama_gudang))
      )
    ON CONFLICT DO NOTHING;

    -- 4. Upsert Header ke inventory.out_lensa_ref_header
    CREATE TEMPORARY TABLE tmp_upserted_out_headers (
        id UUID,
        reservation_id VARCHAR(100)
    ) ON COMMIT DROP;

    WITH ranked_headers AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY reservation_id ORDER BY formatted_date DESC, tgl_entry DESC) as rn
        FROM tmp_stg_out_headers
    ),
    dedup_headers AS (
        SELECT * FROM ranked_headers WHERE rn = 1
    ),
    headers_to_upsert AS (
        SELECT
            dh.*,
            wa.warehouse_id,
            (
                dh.formatted_date < '2026-10-01'::DATE
                OR EXISTS (
                    SELECT 1 FROM inventory.sap_out_header soh
                    WHERE (dh.gi_number IS NOT NULL AND TRIM(soh.sap_number) = dh.gi_number)
                       OR (TRIM(soh.request_id) = dh.reservation_id)
                )
            ) AS is_sap_out_check
        FROM dedup_headers dh
        LEFT JOIN inventory.warehouse_alias wa 
          ON LOWER(TRIM(wa.alias_name)) = LOWER(TRIM(dh.nama_gudang))
         AND (wa.regional = dh.regional OR wa.regional = 'REGIONAL-5')
    ),
    upserted_rows AS (
        INSERT INTO inventory.out_lensa_ref_header (
            reservation_id,
            tgl_entry,
            formatted_date,
            nama_gudang,
            warehouse_id,
            regional,
            project_id,
            mitra,
            nik_pemakai,
            reservation_id_sap,
            scraped_by_username,
            gi_number,
            status_proses,
            sap_out_check,
            created_at,
            updated_at
        )
        SELECT
            h.reservation_id,
            h.tgl_entry,
            h.formatted_date,
            h.nama_gudang,
            h.warehouse_id,
            h.regional,
            h.project_id,
            h.mitra,
            h.nik_pemakai,
            h.reservation_id_sap,
            h.scraped_by_username,
            h.gi_number,
            h.status_proses,
            h.is_sap_out_check,
            NOW(),
            NOW()
        FROM headers_to_upsert h
        ON CONFLICT (reservation_id) DO UPDATE SET
            tgl_entry = COALESCE(EXCLUDED.tgl_entry, inventory.out_lensa_ref_header.tgl_entry),
            formatted_date = COALESCE(EXCLUDED.formatted_date, inventory.out_lensa_ref_header.formatted_date),
            nama_gudang = COALESCE(EXCLUDED.nama_gudang, inventory.out_lensa_ref_header.nama_gudang),
            warehouse_id = COALESCE(EXCLUDED.warehouse_id, inventory.out_lensa_ref_header.warehouse_id),
            regional = COALESCE(EXCLUDED.regional, inventory.out_lensa_ref_header.regional),
            project_id = COALESCE(EXCLUDED.project_id, inventory.out_lensa_ref_header.project_id),
            mitra = COALESCE(EXCLUDED.mitra, inventory.out_lensa_ref_header.mitra),
            nik_pemakai = COALESCE(EXCLUDED.nik_pemakai, inventory.out_lensa_ref_header.nik_pemakai),
            reservation_id_sap = COALESCE(EXCLUDED.reservation_id_sap, inventory.out_lensa_ref_header.reservation_id_sap),
            scraped_by_username = COALESCE(EXCLUDED.scraped_by_username, inventory.out_lensa_ref_header.scraped_by_username),
            gi_number = COALESCE(EXCLUDED.gi_number, inventory.out_lensa_ref_header.gi_number),
            status_proses = COALESCE(EXCLUDED.status_proses, inventory.out_lensa_ref_header.status_proses),
            sap_out_check = CASE 
                WHEN inventory.out_lensa_ref_header.sap_out_check = TRUE THEN TRUE 
                ELSE EXCLUDED.sap_out_check 
            END,
            updated_at = NOW()
        RETURNING id, reservation_id
    )
    INSERT INTO tmp_upserted_out_headers (id, reservation_id)
    SELECT id, reservation_id FROM upserted_rows;

    GET DIAGNOSTICS p_processed_count = ROW_COUNT;

    -- 5. Jika batch menyertakan detail items (array tidak kosong)
    IF EXISTS (
        SELECT 1 FROM tmp_stg_out_headers 
        WHERE items_payload IS NOT NULL 
          AND jsonb_typeof(items_payload) = 'array' 
          AND jsonb_array_length(items_payload) > 0
    ) THEN
        -- Hapus detail lama untuk header yang diperbarui detailnya
        DELETE FROM inventory.out_lensa_ref_list
        WHERE header_id IN (
            SELECT u.id 
            FROM tmp_upserted_out_headers u
            JOIN tmp_stg_out_headers s ON s.reservation_id = u.reservation_id
            WHERE s.items_payload IS NOT NULL AND jsonb_typeof(s.items_payload) = 'array'
        );

        -- Masukkan detail items baru
        WITH unnested_items AS (
            SELECT
                u.id AS header_id,
                item_elem
            FROM tmp_upserted_out_headers u
            JOIN tmp_stg_out_headers s ON s.reservation_id = u.reservation_id,
                 jsonb_array_elements(s.items_payload) AS item_elem
            WHERE s.items_payload IS NOT NULL AND jsonb_typeof(s.items_payload) = 'array'
        )
        INSERT INTO inventory.out_lensa_ref_list (
            header_id,
            material_id,
            material_desc,
            qty_req,
            qty_approve,
            created_at
        )
        SELECT
            ui.header_id,
            COALESCE(
                ma.material_code,
                NULLIF(TRIM(COALESCE(ui.item_elem->>'material_id', ui.item_elem->>'ID MATERIAL')), '')
            ),
            NULLIF(TRIM(COALESCE(ui.item_elem->>'material_desc', ui.item_elem->>'NAMA MATERIAL')), ''),
            NULLIF(REGEXP_REPLACE(COALESCE(ui.item_elem->>'qty_req', ui.item_elem->>'QTY REQUEST', '')::text, '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
            COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(ui.item_elem->>'qty_approve', ui.item_elem->>'QTY APPROVE', '0')::text, '[^0-9.]', '', 'g'), '')::NUMERIC(10,2), 0),
            NOW()
        FROM unnested_items ui
        LEFT JOIN inventory.material_alias ma
          ON LOWER(TRIM(ma.raw_material_name)) = LOWER(TRIM(COALESCE(ui.item_elem->>'material_desc', ui.item_elem->>'NAMA MATERIAL', '')));
    END IF;

    -- 6. Update status staging record
    UPDATE etl.stg_out_lensa_raw
    SET status = 'PROCESSED', processed_at = NOW()
    WHERE batch_id = p_batch_id;

    -- 7. Retensi otomatis: hapus data staging PROCESSED > 90 hari
    DELETE FROM etl.stg_out_lensa_raw
    WHERE status = 'PROCESSED' AND created_at < NOW() - INTERVAL '90 days';

EXCEPTION WHEN OTHERS THEN
    p_error_count := 1;
    UPDATE etl.stg_out_lensa_raw
    SET status = 'FAILED', error_message = SQLERRM, processed_at = NOW()
    WHERE batch_id = p_batch_id;
    RAISE WARNING '[ELT-OUT-LENSA] Batch % failed: %', p_batch_id, SQLERRM;
END;
$$;

-- ==============================================================================
-- 4. STORED PROCEDURE: TRANSFORMATION & NORMALISASI WO LENSA
-- ==============================================================================

CREATE OR REPLACE PROCEDURE inventory.sp_process_stg_wo_lensa(
    p_batch_id UUID,
    OUT p_processed_count INT,
    OUT p_error_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_raw INT;
BEGIN
    p_processed_count := 0;
    p_error_count := 0;

    -- 1. Validasi batch
    SELECT COUNT(*) INTO v_total_raw
    FROM etl.stg_wo_lensa_raw
    WHERE batch_id = p_batch_id AND status = 'PENDING';

    IF v_total_raw = 0 THEN
        RETURN;
    END IF;

    -- 2. Parsing raw payload
    CREATE TEMPORARY TABLE tmp_stg_wo_headers ON COMMIT DROP AS
    WITH unnested_elements AS (
        SELECT 
            s.id AS stg_id,
            s.regional AS stg_regional,
            elem
        FROM etl.stg_wo_lensa_raw s,
             jsonb_array_elements(
                 CASE 
                     WHEN jsonb_typeof(s.raw_payload) = 'array' THEN s.raw_payload
                     ELSE jsonb_build_array(s.raw_payload)
                 END
             ) AS elem
        WHERE s.batch_id = p_batch_id AND s.status = 'PENDING'
    )
    SELECT
        stg_id,
        NULLIF(TRIM(elem->>'pemakaian_id'), '')::BIGINT AS pemakaian_id,
        NULLIF(TRIM(elem->>'wo_number'), '') AS wo_number,
        NULLIF(TRIM(elem->>'nama_gudang'), '') AS nama_gudang,
        NULLIF(TRIM(elem->>'nik_pemakai'), '') AS nik_pemakai,
        NULLIF(TRIM(elem->>'gi_number'), '') AS gi_number,
        NULLIF(TRIM(elem->>'tanggal_update'), '') AS tanggal_update,
        COALESCE(
            NULLIF(TRIM(elem->>'formatted_date'), '')::DATE,
            CASE 
                WHEN elem->>'tanggal_update' ~ '^\d{4}-\d{2}-\d{2}' THEN (elem->>'tanggal_update')::DATE
                WHEN elem->>'tanggal_update' ~ '^\d{2}-\d{2}-\d{4}' THEN to_date(SUBSTRING(elem->>'tanggal_update' FROM 1 FOR 10), 'DD-MM-YYYY')
                ELSE CURRENT_DATE
            END
        ) AS formatted_date,
        NULLIF(TRIM(elem->>'type'), '') AS type,
        NULLIF(TRIM(elem->>'wbs'), '') AS wbs,
        COALESCE(NULLIF(TRIM(elem->>'regional'), ''), stg_regional, 'REGIONAL-5') AS regional,
        elem->'items' AS items_payload
    FROM unnested_elements
    WHERE NULLIF(TRIM(elem->>'pemakaian_id'), '') IS NOT NULL;

    -- 3. Catat anomali alias gudang
    INSERT INTO inventory.unmapped_alias_log (alias_type, raw_value, source_system, regional)
    SELECT DISTINCT 'WAREHOUSE', t.nama_gudang, 'LENSA_WO', t.regional
    FROM tmp_stg_wo_headers t
    WHERE t.nama_gudang IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM inventory.warehouse_alias wa
          WHERE LOWER(TRIM(wa.alias_name)) = LOWER(TRIM(t.nama_gudang))
      )
    ON CONFLICT DO NOTHING;

    -- 4. Rollback rejected WO jika terdeteksi 'REJECTED'
    UPDATE inventory.wo_lensa_header wh
    SET wo_number = 'REJECTED', rekon_check = FALSE
    FROM tmp_stg_wo_headers t
    WHERE wh.pemakaian_id = t.pemakaian_id
      AND UPPER(t.wo_number) LIKE '%REJECTED%';

    -- 5. Upsert Header ke inventory.wo_lensa_header
    CREATE TEMPORARY TABLE tmp_upserted_wo_headers (
        id BIGINT,
        pemakaian_id BIGINT
    ) ON COMMIT DROP;

    WITH ranked_headers AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY pemakaian_id ORDER BY formatted_date DESC, tanggal_update DESC) as rn
        FROM tmp_stg_wo_headers
        WHERE UPPER(wo_number) NOT LIKE '%REJECTED%'
    ),
    dedup_headers AS (
        SELECT * FROM ranked_headers WHERE rn = 1
    ),
    headers_to_upsert AS (
        SELECT
            dh.*,
            wa.warehouse_id,
            EXISTS (
                SELECT 1 FROM inventory.rekon_used_header ruh
                WHERE (ruh.id_pemakaian = dh.pemakaian_id::text)
                   OR (dh.wo_number IS NOT NULL AND TRIM(ruh.wo_number) = dh.wo_number)
            ) AS is_rekon_check
        FROM dedup_headers dh
        LEFT JOIN inventory.warehouse_alias wa 
          ON LOWER(TRIM(wa.alias_name)) = LOWER(TRIM(dh.nama_gudang))
         AND (wa.regional = dh.regional OR wa.regional = 'REGIONAL-5')
    ),
    upserted_rows AS (
        INSERT INTO inventory.wo_lensa_header (
            pemakaian_id,
            gi_number,
            nama_gudang,
            warehouse_id,
            nik_pemakai,
            tanggal_update,
            formatted_date,
            type,
            wbs,
            wo_number,
            rekon_check,
            created_at
        )
        SELECT
            h.pemakaian_id,
            h.gi_number,
            h.nama_gudang,
            h.warehouse_id,
            h.nik_pemakai,
            h.tanggal_update,
            h.formatted_date,
            h.type,
            h.wbs,
            h.wo_number,
            h.is_rekon_check,
            NOW()
        FROM headers_to_upsert h
        ON CONFLICT (pemakaian_id) DO UPDATE SET
            gi_number = COALESCE(EXCLUDED.gi_number, inventory.wo_lensa_header.gi_number),
            nama_gudang = COALESCE(EXCLUDED.nama_gudang, inventory.wo_lensa_header.nama_gudang),
            warehouse_id = COALESCE(EXCLUDED.warehouse_id, inventory.wo_lensa_header.warehouse_id),
            nik_pemakai = COALESCE(EXCLUDED.nik_pemakai, inventory.wo_lensa_header.nik_pemakai),
            tanggal_update = COALESCE(EXCLUDED.tanggal_update, inventory.wo_lensa_header.tanggal_update),
            formatted_date = COALESCE(EXCLUDED.formatted_date, inventory.wo_lensa_header.formatted_date),
            type = COALESCE(EXCLUDED.type, inventory.wo_lensa_header.type),
            wbs = COALESCE(EXCLUDED.wbs, inventory.wo_lensa_header.wbs),
            wo_number = COALESCE(EXCLUDED.wo_number, inventory.wo_lensa_header.wo_number),
            rekon_check = CASE 
                WHEN inventory.wo_lensa_header.rekon_check = TRUE THEN TRUE 
                ELSE EXCLUDED.rekon_check 
            END
        RETURNING id, pemakaian_id
    )
    INSERT INTO tmp_upserted_wo_headers (id, pemakaian_id)
    SELECT id, pemakaian_id FROM upserted_rows;

    GET DIAGNOSTICS p_processed_count = ROW_COUNT;

    -- 6. Detail Items
    IF EXISTS (
        SELECT 1 FROM tmp_stg_wo_headers 
        WHERE items_payload IS NOT NULL 
          AND jsonb_typeof(items_payload) = 'array' 
          AND jsonb_array_length(items_payload) > 0
    ) THEN
        DELETE FROM inventory.wo_lensa_list
        WHERE header_id IN (
            SELECT u.id 
            FROM tmp_upserted_wo_headers u
            JOIN tmp_stg_wo_headers s ON s.pemakaian_id = u.pemakaian_id
            WHERE s.items_payload IS NOT NULL AND jsonb_typeof(s.items_payload) = 'array'
        );

        WITH unnested_items AS (
            SELECT
                u.id AS header_id,
                item_elem
            FROM tmp_upserted_wo_headers u
            JOIN tmp_stg_wo_headers s ON s.pemakaian_id = u.pemakaian_id,
                 jsonb_array_elements(s.items_payload) AS item_elem
            WHERE s.items_payload IS NOT NULL AND jsonb_typeof(s.items_payload) = 'array'
        )
        INSERT INTO inventory.wo_lensa_list (
            header_id,
            material_id,
            material_desc,
            qty_pemakaian,
            uom,
            created_at
        )
        SELECT
            ui.header_id,
            COALESCE(
                ma.material_code,
                NULLIF(TRIM(COALESCE(ui.item_elem->>'material_id', ui.item_elem->>'ID MATERIAL')), '')
            ),
            NULLIF(TRIM(COALESCE(ui.item_elem->>'material_desc', ui.item_elem->>'NAMA MATERIAL')), ''),
            COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(ui.item_elem->>'qty_pemakaian', ui.item_elem->>'QTY PEMAKAIAN', '0')::text, '[^0-9]', '', 'g'), '')::INT, 0),
            NULLIF(TRIM(COALESCE(ui.item_elem->>'uom', ui.item_elem->>'SATUAN')), ''),
            NOW()
        FROM unnested_items ui
        LEFT JOIN inventory.material_alias ma
          ON LOWER(TRIM(ma.raw_material_name)) = LOWER(TRIM(COALESCE(ui.item_elem->>'material_desc', ui.item_elem->>'NAMA MATERIAL', '')));
    END IF;

    -- 7. Update status staging
    UPDATE etl.stg_wo_lensa_raw
    SET status = 'PROCESSED', processed_at = NOW()
    WHERE batch_id = p_batch_id;

    -- 8. Retensi otomatis > 90 hari
    DELETE FROM etl.stg_wo_lensa_raw
    WHERE status = 'PROCESSED' AND created_at < NOW() - INTERVAL '90 days';

EXCEPTION WHEN OTHERS THEN
    p_error_count := 1;
    UPDATE etl.stg_wo_lensa_raw
    SET status = 'FAILED', error_message = SQLERRM, processed_at = NOW()
    WHERE batch_id = p_batch_id;
    RAISE WARNING '[ELT-WO-LENSA] Batch % failed: %', p_batch_id, SQLERRM;
END;
$$;

-- ==============================================================================
-- 5. MATERIALIZED VIEW SAFE REFRESH DENGAN ADVISORY TRANSACTION LOCK
-- ==============================================================================

-- 5.1 Prosedur Dedicated untuk refresh aman MViews Lensa
CREATE OR REPLACE PROCEDURE analytics.sp_refresh_lensa_mviews_safe(
    OUT p_out_lensa_refreshed BOOLEAN,
    OUT p_wo_lensa_refreshed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    p_out_lensa_refreshed := FALSE;
    p_wo_lensa_refreshed := FALSE;

    -- 1. Refresh mv_out_sap_lensa_summary aman dari bentrok
    IF pg_try_advisory_xact_lock(hashtext('analytics.mv_out_sap_lensa_summary')) THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_out_sap_lensa_summary;
        p_out_lensa_refreshed := TRUE;
    END IF;

    -- 2. Refresh mv_wo_lensa_rekon_summary aman dari bentrok
    IF pg_try_advisory_xact_lock(hashtext('analytics.mv_wo_lensa_rekon_summary')) THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_wo_lensa_rekon_summary;
        p_wo_lensa_refreshed := TRUE;
    END IF;
END;
$$;

-- 5.2 Perbarui sp_refresh_analytics_mviews agar juga memakai advisory lock pada seluruh mview
CREATE OR REPLACE PROCEDURE analytics.sp_refresh_analytics_mviews()
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_duration_ms INT;
    v_kpro_lock BOOLEAN;
    v_out_lock BOOLEAN;
    v_wo_lock BOOLEAN;
BEGIN
    -- 1. Refresh mv_kpro_rekon_summary secara aman dari bentrok
    SELECT pg_try_advisory_xact_lock(hashtext('analytics.mv_kpro_rekon_summary')) INTO v_kpro_lock;
    IF v_kpro_lock THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_kpro_rekon_summary;
        INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
        VALUES ('analytics.mv_kpro_rekon_summary', NOW(), 1, NOW());
    ELSE
        RAISE NOTICE '[ANALYTICS] Concurrent refresh already in progress for mv_kpro_rekon_summary, skipping.';
    END IF;

    -- 2. Refresh MView Out Lensa secara aman
    SELECT pg_try_advisory_xact_lock(hashtext('analytics.mv_out_sap_lensa_summary')) INTO v_out_lock;
    IF v_out_lock THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_out_sap_lensa_summary;
        INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
        VALUES ('analytics.mv_out_sap_lensa_summary', NOW(), 1, NOW());
    ELSE
        RAISE NOTICE '[ANALYTICS] Concurrent refresh already in progress for mv_out_sap_lensa_summary, skipping.';
    END IF;

    -- 3. Refresh MView WO Lensa secara aman
    SELECT pg_try_advisory_xact_lock(hashtext('analytics.mv_wo_lensa_rekon_summary')) INTO v_wo_lock;
    IF v_wo_lock THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_wo_lensa_rekon_summary;
        INSERT INTO etl.upload_logs (table_name, last_updated_at, updated_by, created_at)
        VALUES ('analytics.mv_wo_lensa_rekon_summary', NOW(), 1, NOW());
    ELSE
        RAISE NOTICE '[ANALYTICS] Concurrent refresh already in progress for mv_wo_lensa_rekon_summary, skipping.';
    END IF;

    v_duration_ms := ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000);

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[ANALYTICS] Failed to refresh analytics materialized views: %', SQLERRM;
    RAISE;
END;
$$;

-- ==============================================================================
-- 6. HAK AKSES EKSEKUSI (SECURITY L3 COMPLIANCE)
-- ==============================================================================

REVOKE EXECUTE ON PROCEDURE inventory.sp_process_stg_out_lensa(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE inventory.sp_process_stg_out_lensa(UUID, INT, INT) TO imam;

REVOKE EXECUTE ON PROCEDURE inventory.sp_process_stg_wo_lensa(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE inventory.sp_process_stg_wo_lensa(UUID, INT, INT) TO imam;

REVOKE EXECUTE ON PROCEDURE analytics.sp_refresh_lensa_mviews_safe(BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE analytics.sp_refresh_lensa_mviews_safe(BOOLEAN, BOOLEAN) TO imam;
