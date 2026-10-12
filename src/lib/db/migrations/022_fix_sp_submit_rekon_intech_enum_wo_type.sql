-- Migration: Fix sp_submit_rekon_intech enum_wo_type cast schema qualification
-- Description: sp_submit_rekon_intech previously cast p_wo_type to unqualified enum_wo_type
--              causing PostgreSQL error: type "enum_wo_type" does not exist when default search_path
--              does not include the inventory schema.
--              This migration replaces sp_submit_rekon_intech to explicitly qualify inventory.enum_wo_type
--              and normalizes input casing and spaces (e.g. 'psb', 'PSB', 'lintas arta', 'lintas_arta').

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
    v_wo_type inventory.enum_wo_type;
BEGIN
    -- Cast sap_out_id to bigint once
    v_sap_out_id_bigint := p_sap_out_id::bigint;

    -- Validate and cast wo_type with schema qualification and case/space normalization
    IF p_wo_type IS NULL OR TRIM(p_wo_type) = '' THEN
        RAISE EXCEPTION 'WO Type tidak boleh kosong';
    END IF;

    v_wo_type := LOWER(TRIM(REPLACE(p_wo_type, ' ', '_')))::inventory.enum_wo_type;

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
        p_id_trx, v_sap_out_id_bigint, p_nik, p_wo_number, v_wo_type,
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
