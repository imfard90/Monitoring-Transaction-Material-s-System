-- ============================================================================
-- Migration: 076_fix_sp_out_lensa_qty_json_keys_and_reprocess.sql
-- Description:
-- 1. Memperbaiki mapping JSON key pada inventory.sp_process_stg_out_lensa agar
--    mendukung format payload portal Lensa ("QTY", "QTY ACCEPTED", "QTY REQ PR")
--    selain key internal ("qty_req", "qty_approve", "QTY REQUEST", "QTY APPROVE").
-- 2. Menyelaraskan batas cutoff historis ke <= '2026-10-31' (periode 10).
-- 3. Memproses ulang batch staging '404191b6-a812-4f2d-8620-8d8b31babe43'
--    agar 65 baris detail material langsung terisi kuantitas yang benar.
-- ============================================================================

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
                dh.formatted_date <= '2026-10-31'::DATE
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

        -- Masukkan detail items baru dengan dukungan variasi key JSON portal Lensa
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
            NULLIF(REGEXP_REPLACE(COALESCE(
                NULLIF(TRIM(ui.item_elem->>'qty_req'), ''),
                NULLIF(TRIM(ui.item_elem->>'QTY REQUEST'), ''),
                NULLIF(TRIM(ui.item_elem->>'QTY REQ PR'), ''),
                NULLIF(TRIM(ui.item_elem->>'QTY'), ''),
                ''
            )::text, '[^0-9.]', '', 'g'), '')::NUMERIC(10,2),
            COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(
                NULLIF(TRIM(ui.item_elem->>'qty_approve'), ''),
                NULLIF(TRIM(ui.item_elem->>'QTY APPROVE'), ''),
                NULLIF(TRIM(ui.item_elem->>'QTY ACCEPTED'), ''),
                NULLIF(TRIM(ui.item_elem->>'QTY'), ''),
                '0'
            )::text, '[^0-9.]', '', 'g'), '')::NUMERIC(10,2), 0),
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

-- Re-process batch detail terbaru agar 65 item langsung terisi kuantitas yang akurat (idempoten)
DO $$
DECLARE
    v_proc INT := 0;
    v_err  INT := 0;
    v_target_batch UUID := '404191b6-a812-4f2d-8620-8d8b31babe43';
BEGIN
    IF EXISTS (SELECT 1 FROM etl.stg_out_lensa_raw WHERE batch_id = v_target_batch) THEN
        UPDATE etl.stg_out_lensa_raw
        SET status = 'PENDING', processed_at = NULL
        WHERE batch_id = v_target_batch;

        CALL inventory.sp_process_stg_out_lensa(v_target_batch, v_proc, v_err);
    END IF;
END $$;
