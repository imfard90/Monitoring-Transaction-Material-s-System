-- Migration: Create sp_submit_rekon_intech — atomic rekon intech submission
-- Description: Moves entire Rekon Intech business logic into the database layer.
--
-- P0-D1 fix: Previously, submitRekonIntech in app layer:
-- 1. Generated id_trx via COUNT(*) (now fixed by P0-D2 sequence)
-- 2. Inserted transaction_used_header manually
-- 3. Looped items: insert transaction_used_item, update sap_out_items.qty_used, call sp_record_material_used
-- 4. Checked auto-close manually
--
-- SP does all atomically within a single database transaction,
-- FOR UPDATE locks prevent concurrent modifications.
--
-- Parameters:
-- p_id_trx      — Pre-generated id_trx (from app, using nextval sequence)
-- p_nik         — Technician NIK
-- p_sap_out_id  — SAP Out header ID
-- p_wo_number   — WO Number
-- p_wo_type     — WO Type (enum_wo_type)
-- p_name_sa     — Service Area name
-- p_name_wh     — Warehouse name
-- p_created_by  — Creator NIK
-- p_items       — JSON array: [{designator_id, sap_out_item_id, qty, notes}, ...]

CREATE OR REPLACE PROCEDURE inventory.sp_submit_rekon_intech(
    p_id_trx VARCHAR,
    p_nik VARCHAR,
    p_sap_out_id VARCHAR,
    p_wo_number VARCHAR,
    p_wo_type VARCHAR,
    p_name_sa VARCHAR,
    p_name_wh VARCHAR,
    p_created_by VARCHAR,
    p_items JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_header_id BIGINT;
    v_warehouse_id INT;
    v_item RECORD;
    v_all_closed BOOLEAN;
    v_existing_header RECORD;
    v_sap_out_id_bigint BIGINT;
BEGIN
    -- Cast sap_out_id to bigint once
    v_sap_out_id_bigint := p_sap_out_id::bigint;

    -- 1. Check duplicate id_trx
    SELECT id INTO v_existing_header
    FROM inventory.transaction_used_header
    WHERE id_trx = p_id_trx
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'id_trx % sudah ada di transaction_used_header', p_id_trx;
    END IF;

    -- 2. Lock SAP Out header row and fetch warehouse_id
    SELECT warehouse_id INTO v_warehouse_id
    FROM inventory.sap_out_header
    WHERE id = v_sap_out_id_bigint
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SAP Out header dengan id % tidak ditemukan', p_sap_out_id;
    END IF;

    -- 3. Insert transaction_used_header
    INSERT INTO inventory.transaction_used_header (
        id_trx, sap_out_id, nik_teknisi, wo_number, wo_type,
        name_sa, name_wh, created_by, created_at
    )
    VALUES (
        p_id_trx, v_sap_out_id_bigint, p_nik, p_wo_number, p_wo_type::enum_wo_type,
        p_name_sa, p_name_wh, p_created_by, NOW()
    )
    RETURNING id INTO v_header_id;

    -- 4. Loop through items and process atomically
    FOR v_item IN
        SELECT * FROM jsonb_to_recordset(p_items) AS (
            designator_id INT,
            sap_out_item_id BIGINT,
            qty NUMERIC,
            notes TEXT
        )
    LOOP
        -- 4a. Lock sap_out_item row
        PERFORM 1 FROM inventory.sap_out_items
        WHERE id = v_item.sap_out_item_id
        FOR UPDATE;

        -- 4b. Validate qty does not exceed remaining
        IF NOT EXISTS (
            SELECT 1 FROM inventory.sap_out_items
            WHERE id = v_item.sap_out_item_id
            AND v_item.qty <= (qty_req - COALESCE(qty_used, 0))
        ) THEN
            RAISE EXCEPTION 'Qty % melebihi sisa untuk sap_out_item_id %',
                v_item.qty, v_item.sap_out_item_id;
        END IF;

        -- 4c. Insert transaction_used_item
        INSERT INTO inventory.transaction_used_item (
            used_id, designator_id, qty, notes
        )
        VALUES (
            v_header_id, v_item.designator_id, v_item.qty, v_item.notes
        );

        -- 4d. Update sap_out_items.qty_used
        UPDATE inventory.sap_out_items
        SET qty_used = COALESCE(qty_used, 0) + v_item.qty
        WHERE id = v_item.sap_out_item_id;

        -- 4e. Call sp_record_material_used for audit movement
        CALL inventory.sp_record_material_used(
            v_warehouse_id,
            v_item.designator_id,
            v_item.qty::int,
            p_id_trx,
            v_item.notes,
            p_created_by
        );
    END LOOP;

    -- 5. Check if SAP Out header should be auto-closed
    SELECT bool_and(qty_req = COALESCE(qty_used, 0)) INTO v_all_closed
    FROM inventory.sap_out_items
    WHERE header_id = v_sap_out_id_bigint;

    IF v_all_closed THEN
        UPDATE inventory.sap_out_header
        SET end_status = 'close'
        WHERE id = v_sap_out_id_bigint;
    END IF;
END;
$$;
