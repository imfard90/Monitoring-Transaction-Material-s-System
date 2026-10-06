-- Migration: SP for Rekon Lensa
-- Description: Creates stored procedure for inserting transaction used items from Rekon Lensa

CREATE OR REPLACE PROCEDURE inventory.sp_record_material_used_lensa(
    p_id_trx VARCHAR,
    p_sap_out_id BIGINT,
    p_nik_teknisi VARCHAR,
    p_name_sa VARCHAR,
    p_name_wh VARCHAR,
    p_wo_number VARCHAR,
    p_wo_type VARCHAR,
    p_designator_id BIGINT,
    p_sap_out_item_id BIGINT,
    p_qty NUMERIC,
    p_notes TEXT,
    p_created_by VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_header_id BIGINT;
    v_qty_req NUMERIC;
    v_qty_used NUMERIC;
    v_warehouse_id INT;
    v_all_closed BOOLEAN;
BEGIN
    -- 1. Fetch info from sap_out_items
    SELECT qty_req, COALESCE(qty_used, 0)
    INTO v_qty_req, v_qty_used
    FROM inventory.sap_out_items
    WHERE id = p_sap_out_item_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item SAP Out tidak ditemukan.';
    END IF;

    -- 2. Validate qty
    IF v_qty_used + p_qty > v_qty_req THEN
        RAISE EXCEPTION 'QTY Used melebihi QTY Request. Tersisa %', (v_qty_req - v_qty_used);
    END IF;

    -- 3. Check if header already exists for this id_trx and sap_out_id
    SELECT id INTO v_header_id
    FROM inventory.transaction_used_header
    WHERE id_trx = p_id_trx AND sap_out_id = p_sap_out_id;

    IF NOT FOUND THEN
        INSERT INTO inventory.transaction_used_header (
            id_trx, sap_out_id, nik_teknisi, name_sa, name_wh, wo_number, wo_type, created_by
        ) VALUES (
            p_id_trx, p_sap_out_id, p_nik_teknisi, p_name_sa, p_name_wh, p_wo_number, p_wo_type::inventory.enum_wo_type, p_created_by
        ) RETURNING id INTO v_header_id;
    END IF;

    -- 4. Insert into transaction_used_item
    INSERT INTO inventory.transaction_used_item (used_id, designator_id, qty, notes)
    VALUES (v_header_id, p_designator_id, p_qty, p_notes);

    -- 5. Update sap_out_items
    UPDATE inventory.sap_out_items
    SET qty_used = COALESCE(qty_used, 0) + p_qty
    WHERE id = p_sap_out_item_id;

    -- 6. Call sp_record_material_used (for audit movement)
    SELECT warehouse_id INTO v_warehouse_id FROM inventory.sap_out_header WHERE id = p_sap_out_id;
    CALL inventory.sp_record_material_used(v_warehouse_id, p_designator_id::INT, p_qty, p_id_trx, p_notes, p_created_by);

    -- 7. Check if auto-close is needed
    SELECT bool_and(qty_req = COALESCE(qty_used, 0)) INTO v_all_closed
    FROM inventory.sap_out_items
    WHERE header_id = p_sap_out_id;

    IF v_all_closed THEN
        UPDATE inventory.sap_out_header
        SET end_status = 'close'
        WHERE id = p_sap_out_id;
    END IF;
END;
$$;
