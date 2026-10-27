-- Migration: 045_sp_record_rekon_lensa_v2_atomic_sync_and_clean.sql
-- Description: Sanitizes whitespace in rekon_used_header and wo_lensa_header,
--              updates sp_record_rekon_lensa_v2 to atomically mark wo_lensa_header.rekon_check = TRUE,
--              and runs backfill sync for dual-matching (pemakaian_id or wo_number).

-- ============================================================================
-- 1. Sanitize Existing Whitespace in rekon_used_header & wo_lensa_header
-- ============================================================================
UPDATE inventory.rekon_used_header
SET id_pemakaian = TRIM(id_pemakaian),
    wo_number = NULLIF(TRIM(wo_number), ''),
    nik_teknisi = TRIM(nik_teknisi)
WHERE (id_pemakaian IS NOT NULL AND id_pemakaian != TRIM(id_pemakaian))
   OR (wo_number IS NOT NULL AND wo_number != TRIM(wo_number))
   OR (nik_teknisi IS NOT NULL AND nik_teknisi != TRIM(nik_teknisi));

UPDATE inventory.wo_lensa_header
SET wo_number = NULLIF(TRIM(wo_number), ''),
    nik_pemakai = TRIM(nik_pemakai)
WHERE (wo_number IS NOT NULL AND wo_number != TRIM(wo_number))
   OR (nik_pemakai IS NOT NULL AND nik_pemakai != TRIM(nik_pemakai));

-- ============================================================================
-- 2. Update sp_record_rekon_lensa_v2 with Parameter Sanitization & Atomic Sync
-- ============================================================================
CREATE OR REPLACE PROCEDURE inventory.sp_record_rekon_lensa_v2(
    p_id_trx VARCHAR,
    p_id_pemakaian VARCHAR,
    p_wo_number VARCHAR,
    p_wo_type VARCHAR,
    p_nik_teknisi VARCHAR,
    p_name_gudang VARCHAR,
    p_name_sa VARCHAR,
    p_notes TEXT,
    p_create_by VARCHAR,
    p_materials JSON
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_clean_id_trx VARCHAR := TRIM(p_id_trx);
    v_clean_pemakaian_id VARCHAR := NULLIF(TRIM(p_id_pemakaian), '');
    v_clean_wo_number VARCHAR := NULLIF(TRIM(p_wo_number), '');
    v_clean_wo_type VARCHAR := NULLIF(TRIM(p_wo_type), '');
    v_clean_nik_teknisi VARCHAR := TRIM(p_nik_teknisi);
    v_clean_name_gudang VARCHAR := NULLIF(TRIM(p_name_gudang), '');
    v_clean_name_sa VARCHAR := NULLIF(TRIM(p_name_sa), '');
    v_clean_create_by VARCHAR := TRIM(p_create_by);

    v_header_id BIGINT;
    v_material_id INT;
    v_sap_out_id BIGINT;
    v_warehouse_id INT;
    v_remaining_qty NUMERIC;
    v_item RECORD;
    v_deduct_qty NUMERIC;
    v_all_closed BOOLEAN;
    v_mat RECORD;
    v_clean_out_sap VARCHAR;
    v_clean_designator_id VARCHAR;
BEGIN
    -- 1. Check if header already exists for this id_trx
    SELECT id INTO v_header_id
    FROM inventory.rekon_used_header
    WHERE id_trx = v_clean_id_trx;

    IF NOT FOUND THEN
        INSERT INTO inventory.rekon_used_header (
            id_trx, id_pemakaian, wo_number, wo_type, nik_teknisi, name_gudang, name_sa, notes, create_by
        ) VALUES (
            v_clean_id_trx,
            COALESCE(v_clean_pemakaian_id, ''),
            v_clean_wo_number,
            v_clean_wo_type,
            v_clean_nik_teknisi,
            v_clean_name_gudang,
            v_clean_name_sa,
            p_notes,
            v_clean_create_by
        ) RETURNING id INTO v_header_id;
    END IF;

    -- Loop through materials JSON array
    FOR v_mat IN SELECT * FROM json_populate_recordset(null::record, p_materials) AS (out_sap VARCHAR, designator_id VARCHAR, qty NUMERIC, unit_price NUMERIC)
    LOOP
        v_clean_out_sap := TRIM(v_mat.out_sap);
        v_clean_designator_id := TRIM(v_mat.designator_id);
        v_remaining_qty := v_mat.qty;

        -- 2. Get material ID from code
        SELECT id INTO v_material_id
        FROM inventory.materials
        WHERE code = v_clean_designator_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Material dengan code % tidak ditemukan.', v_clean_designator_id;
        END IF;

        -- 3. Insert into rekon_used_list
        INSERT INTO inventory.rekon_used_list (
            rekon_used_id, out_sap, designator_id, qty, unit_price
        ) VALUES (
            v_header_id, v_clean_out_sap, v_clean_designator_id, v_mat.qty, v_mat.unit_price
        );

        -- 4. Find sap_out_header
        SELECT id, warehouse_id INTO v_sap_out_id, v_warehouse_id
        FROM inventory.sap_out_header
        WHERE sap_number = v_clean_out_sap;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SAP Out dengan nomor % tidak ditemukan.', v_clean_out_sap;
        END IF;

        -- 5. FIFO logic to deduct from sap_out_items
        FOR v_item IN
            SELECT id, qty_req, COALESCE(qty_used, 0) as qty_used
            FROM inventory.sap_out_items
            WHERE header_id = v_sap_out_id AND designator_id = v_material_id
            ORDER BY id ASC
            FOR UPDATE
        LOOP
            IF v_remaining_qty <= 0 THEN
                EXIT;
            END IF;

            IF v_item.qty_req > v_item.qty_used THEN
                v_deduct_qty := LEAST(v_remaining_qty, v_item.qty_req - v_item.qty_used);

                UPDATE inventory.sap_out_items
                SET qty_used = COALESCE(qty_used, 0) + v_deduct_qty
                WHERE id = v_item.id;

                v_remaining_qty := v_remaining_qty - v_deduct_qty;
            END IF;
        END LOOP;

        IF v_remaining_qty > 0 THEN
            RAISE EXCEPTION 'QTY Used melebihi sisa QTY Request di SAP Out % untuk material %', v_clean_out_sap, v_clean_designator_id;
        END IF;

        -- 6. Call sp_record_material_used (for audit movement)
        CALL inventory.sp_record_material_used(v_warehouse_id, v_material_id, v_mat.qty::int, LEFT(v_clean_id_trx, 50), p_notes, v_clean_create_by);

        -- 7. Check if auto-close is needed for sap_out_header
        SELECT bool_and(qty_req = COALESCE(qty_used, 0)) INTO v_all_closed
        FROM inventory.sap_out_items
        WHERE header_id = v_sap_out_id;

        IF v_all_closed THEN
            UPDATE inventory.sap_out_header
            SET end_status = 'close'
            WHERE id = v_sap_out_id;
        END IF;
    END LOOP;

    -- 8. Atomic update to wo_lensa_header: mark rekon_check = TRUE via dual matching
    IF v_clean_pemakaian_id IS NOT NULL OR v_clean_wo_number IS NOT NULL THEN
        UPDATE inventory.wo_lensa_header
        SET rekon_check = TRUE
        WHERE (
            (v_clean_pemakaian_id IS NOT NULL AND pemakaian_id = v_clean_pemakaian_id::bigint)
            OR
            (v_clean_wo_number IS NOT NULL AND wo_number = v_clean_wo_number)
        )
        AND (rekon_check IS FALSE OR rekon_check IS NULL);
    END IF;
END;
$$;

-- ============================================================================
-- 3. Batch Backfill: Set rekon_check = TRUE for All Existing Reconciled WOs
-- ============================================================================
UPDATE inventory.wo_lensa_header wlh
SET rekon_check = TRUE
FROM inventory.rekon_used_header ruh
WHERE (
    (NULLIF(TRIM(ruh.id_pemakaian), '') IS NOT NULL AND wlh.pemakaian_id = NULLIF(TRIM(ruh.id_pemakaian), '')::bigint)
    OR
    (NULLIF(TRIM(wlh.wo_number), '') IS NOT NULL AND wlh.wo_number = ruh.wo_number)
)
AND (wlh.rekon_check IS FALSE OR wlh.rekon_check IS NULL);
