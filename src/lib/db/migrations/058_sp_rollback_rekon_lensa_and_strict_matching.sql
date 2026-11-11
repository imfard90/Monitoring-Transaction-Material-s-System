-- Migration: 058_sp_rollback_rekon_lensa_and_strict_matching.sql
-- Description: 
-- 1. Adds 'material_return_rekon' to inventory.enum_stock_movement.
-- 2. Updates inventory.sp_record_rekon_lensa_v2 to strictly match wo_lensa_header on pemakaian_id and wo_number (preventing false rekon flags on re-submitted WOs).
-- 3. Creates inventory.sp_rollback_rekon_lensa_by_pemakaian to atomically rollback reconciled rejected WOs (restore sap_out_items, reset sap_out_header to intech, insert stock_movement audit, and delete rekon & wo records).

-- ============================================================================
-- 1. Add 'material_return_rekon' to enum_stock_movement
-- ============================================================================
ALTER TYPE inventory.enum_stock_movement ADD VALUE IF NOT EXISTS 'material_return_rekon';

-- ============================================================================
-- 2. Update sp_record_rekon_lensa_v2 with Strict Matching (pemakaian_id + wo_number)
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

    -- 8. Atomic update to wo_lensa_header: mark rekon_check = TRUE via strict pemakaian_id matching
    IF v_clean_pemakaian_id IS NOT NULL AND v_clean_wo_number IS NOT NULL THEN
        UPDATE inventory.wo_lensa_header
        SET rekon_check = TRUE
        WHERE pemakaian_id = v_clean_pemakaian_id::bigint
          AND wo_number = v_clean_wo_number
          AND (rekon_check IS FALSE OR rekon_check IS NULL);
    ELSIF v_clean_pemakaian_id IS NOT NULL THEN
        UPDATE inventory.wo_lensa_header
        SET rekon_check = TRUE
        WHERE pemakaian_id = v_clean_pemakaian_id::bigint
          AND (rekon_check IS FALSE OR rekon_check IS NULL);
    END IF;
END;
$$;

-- ============================================================================
-- 3. Procedure: sp_rollback_rekon_lensa_by_pemakaian
-- ============================================================================
CREATE OR REPLACE PROCEDURE inventory.sp_rollback_rekon_lensa_by_pemakaian(
    p_pemakaian_id VARCHAR,
    p_notes TEXT DEFAULT NULL,
    p_created_by VARCHAR DEFAULT 'system'
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_clean_pemakaian_id VARCHAR := NULLIF(TRIM(p_pemakaian_id), '');
    v_rekon_header_id BIGINT;
    v_id_trx VARCHAR;
    v_wo_number VARCHAR;
    v_mat RECORD;
    v_material_id INT;
    v_sap_out_id BIGINT;
    v_warehouse_id INT;
    v_remaining_to_restore NUMERIC;
    v_soi RECORD;
    v_restore_qty NUMERIC;
    v_wo_header_id BIGINT;
BEGIN
    IF v_clean_pemakaian_id IS NULL THEN
        RAISE EXCEPTION 'pemakaian_id tidak boleh kosong untuk rollback rekon.';
    END IF;

    -- 1. Check if reconciled in inventory.rekon_used_header
    SELECT id, id_trx, wo_number
    INTO v_rekon_header_id, v_id_trx, v_wo_number
    FROM inventory.rekon_used_header
    WHERE id_pemakaian = v_clean_pemakaian_id
    FOR UPDATE;

    IF FOUND THEN
        -- Loop each material item that was reconciled
        FOR v_mat IN
            SELECT id, out_sap, designator_id, qty, unit_price
            FROM inventory.rekon_used_list
            WHERE rekon_used_id = v_rekon_header_id
            ORDER BY id ASC
            FOR UPDATE
        LOOP
            -- Get material id
            SELECT id INTO v_material_id
            FROM inventory.materials
            WHERE code = TRIM(v_mat.designator_id);

            -- Get sap_out_header id and warehouse
            SELECT id, warehouse_id INTO v_sap_out_id, v_warehouse_id
            FROM inventory.sap_out_header
            WHERE sap_number = TRIM(v_mat.out_sap);

            IF v_sap_out_id IS NOT NULL AND v_material_id IS NOT NULL THEN
                -- Restore qty_used in sap_out_items (reverse order: newest used first)
                v_remaining_to_restore := v_mat.qty;
                FOR v_soi IN
                    SELECT id, qty_req, COALESCE(qty_used, 0) AS qty_used
                    FROM inventory.sap_out_items
                    WHERE header_id = v_sap_out_id
                      AND designator_id = v_material_id
                      AND COALESCE(qty_used, 0) > 0
                    ORDER BY id DESC
                    FOR UPDATE
                LOOP
                    IF v_remaining_to_restore <= 0 THEN
                        EXIT;
                    END IF;
                    v_restore_qty := LEAST(v_remaining_to_restore, v_soi.qty_used);
                    UPDATE inventory.sap_out_items
                    SET qty_used = qty_used - v_restore_qty
                    WHERE id = v_soi.id;
                    v_remaining_to_restore := v_remaining_to_restore - v_restore_qty;
                END LOOP;

                -- Reopen sap_out_header if closed
                UPDATE inventory.sap_out_header
                SET end_status = 'intech'
                WHERE id = v_sap_out_id AND end_status = 'close';

                -- Record audit trail in stock_movement
                INSERT INTO inventory.stock_movement (
                    warehouse_id, designator_id, movement_type, qty_delta, qty_after, reference_trx, notes, created_by
                ) VALUES (
                    v_warehouse_id,
                    v_material_id,
                    'material_return_rekon',
                    v_mat.qty::int,
                    0,
                    LEFT(COALESCE(v_id_trx, v_clean_pemakaian_id), 50),
                    COALESCE(p_notes, 'Rollback Rekon Rejected WO'),
                    COALESCE(p_created_by, 'system')
                );
            END IF;
        END LOOP;

        -- Delete from rekon_used_list and rekon_used_header
        DELETE FROM inventory.rekon_used_list WHERE rekon_used_id = v_rekon_header_id;
        DELETE FROM inventory.rekon_used_header WHERE id = v_rekon_header_id;
    END IF;

    -- 2. Clean up wo_lensa_header and wo_lensa_list
    SELECT id, wo_number INTO v_wo_header_id, v_wo_number
    FROM inventory.wo_lensa_header
    WHERE pemakaian_id::text = v_clean_pemakaian_id
    FOR UPDATE;

    IF FOUND THEN
        DELETE FROM inventory.wo_lensa_list WHERE header_id = v_wo_header_id;
        DELETE FROM inventory.wo_lensa_header WHERE id = v_wo_header_id;
    END IF;

    -- 3. Self-heal other headers that share the same wo_number but are NOT reconciled:
    -- If any wo_lensa_header was previously marked rekon_check = TRUE matching this WO,
    -- but its own pemakaian_id is NOT in rekon_used_header, reset rekon_check = FALSE
    IF v_wo_number IS NOT NULL THEN
        UPDATE inventory.wo_lensa_header wlh
        SET rekon_check = FALSE
        WHERE wlh.wo_number = v_wo_number
          AND wlh.rekon_check IS TRUE
          AND NOT EXISTS (
              SELECT 1
              FROM inventory.rekon_used_header ruh
              WHERE TRIM(ruh.id_pemakaian) = wlh.pemakaian_id::text
          );
    END IF;
END;
$$;

REVOKE EXECUTE ON PROCEDURE inventory.sp_rollback_rekon_lensa_by_pemakaian(VARCHAR, TEXT, VARCHAR) FROM PUBLIC;

