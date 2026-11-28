-- ============================================================================
-- Migration: 077_fix_sp_wo_lensa_null_wo_number_and_reprocess.sql
-- Description:
-- 1. Memperbaiki filter NULL pada inventory.sp_process_stg_wo_lensa:
--    COALESCE(UPPER(wo_number), '') NOT LIKE '%REJECTED%' agar batch detail-only
--    (yang hanya membawa pemakaian_id + items tanpa wo_number) tidak tersaring habis.
-- 2. Menjaga agar detail-only batch tidak menimpa formatted_date header yang sudah ada
--    dengan CURRENT_DATE secara tidak sengaja.
-- 3. Memproses ulang batch staging '41713d9c-1b7b-44f4-b353-92c470066a46'
--    agar detail material dari ke-44 WO baru masuk ke inventory.wo_lensa_list.
-- ============================================================================

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
                WHEN NULLIF(TRIM(elem->>'wo_number'), '') IS NOT NULL THEN CURRENT_DATE
                ELSE NULL
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
      AND t.wo_number IS NOT NULL
      AND UPPER(t.wo_number) LIKE '%REJECTED%';

    -- 5. Upsert Header ke inventory.wo_lensa_header
    CREATE TEMPORARY TABLE tmp_upserted_wo_headers (
        id BIGINT,
        pemakaian_id BIGINT
    ) ON COMMIT DROP;

    WITH ranked_headers AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY pemakaian_id ORDER BY formatted_date DESC NULLS LAST, tanggal_update DESC NULLS LAST) as rn
        FROM tmp_stg_wo_headers
        WHERE COALESCE(UPPER(wo_number), '') NOT LIKE '%REJECTED%'
    ),
    dedup_headers AS (
        SELECT * FROM ranked_headers WHERE rn = 1
    ),
    headers_to_upsert AS (
        SELECT
            dh.*,
            wa.warehouse_id,
            (
                (dh.formatted_date IS NOT NULL AND dh.formatted_date <= '2026-10-31'::DATE)
                OR EXISTS (
                    SELECT 1 FROM inventory.rekon_used_header ruh
                    WHERE (ruh.id_pemakaian = dh.pemakaian_id::text)
                       OR (dh.wo_number IS NOT NULL AND TRIM(ruh.wo_number) = dh.wo_number)
                )
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
            COALESCE(h.formatted_date, CURRENT_DATE),
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
            formatted_date = CASE
                WHEN inventory.wo_lensa_header.formatted_date IS NOT NULL AND EXCLUDED.wo_number IS NULL
                    THEN inventory.wo_lensa_header.formatted_date
                ELSE COALESCE(EXCLUDED.formatted_date, inventory.wo_lensa_header.formatted_date)
            END,
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

-- Re-process batch detail terbaru agar item material dari ke-44 WO langsung masuk ke wo_lensa_list
DO $$
DECLARE
    v_proc INT := 0;
    v_err  INT := 0;
    v_target_batch UUID := '41713d9c-1b7b-44f4-b353-92c470066a46';
BEGIN
    IF EXISTS (SELECT 1 FROM etl.stg_wo_lensa_raw WHERE batch_id = v_target_batch) THEN
        UPDATE etl.stg_wo_lensa_raw
        SET status = 'PENDING', processed_at = NULL
        WHERE batch_id = v_target_batch;

        CALL inventory.sp_process_stg_wo_lensa(v_target_batch, v_proc, v_err);
    END IF;
END $$;
