-- Migration: Improve Transaction SPs
-- Description: Creates stored procedures for inserting transaction used items, editing them, and creating return requests with proper database-level validation to ensure qty_used doesn't exceed qty_req.

CREATE OR REPLACE PROCEDURE inventory.sp_process_transaction_used(
    p_used_id BIGINT,
    p_sap_out_item_id BIGINT,
    p_designator_id BIGINT,
    p_qty NUMERIC,
    p_notes TEXT,
    p_created_by VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_qty_req NUMERIC;
    v_qty_used NUMERIC;
    v_header_id BIGINT;
    v_warehouse_id INT;
    v_id_trx VARCHAR;
    v_all_closed BOOLEAN;
BEGIN
    -- 1. Fetch info from sap_out_items
    SELECT qty_req, COALESCE(qty_used, 0), header_id
    INTO v_qty_req, v_qty_used, v_header_id
    FROM inventory.sap_out_items
    WHERE id = p_sap_out_item_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item SAP Out tidak ditemukan.';
    END IF;

    -- 2. Validate qty
    IF v_qty_used + p_qty > v_qty_req THEN
        RAISE EXCEPTION 'QTY Used melebihi QTY Request. Tersisa %', (v_qty_req - v_qty_used);
    END IF;

    -- 3. Fetch warehouse & id_trx
    SELECT sap.warehouse_id, used.id_trx
    INTO v_warehouse_id, v_id_trx
    FROM inventory.transaction_used_header used
    JOIN inventory.sap_out_header sap ON sap.id = used.sap_out_id
    WHERE used.id = p_used_id;

    -- 4. Insert into transaction_used_item
    INSERT INTO inventory.transaction_used_item (used_id, designator_id, qty, notes)
    VALUES (p_used_id, p_designator_id, p_qty, p_notes);

    -- 5. Update sap_out_items
    UPDATE inventory.sap_out_items
    SET qty_used = COALESCE(qty_used, 0) + p_qty
    WHERE id = p_sap_out_item_id;

    -- 6. Call sp_record_material_used (for audit movement)
    CALL inventory.sp_record_material_used(v_warehouse_id, p_designator_id::INT, p_qty, v_id_trx, p_notes, p_created_by);

    -- 7. Check if auto-close is needed
    SELECT bool_and(qty_req = COALESCE(qty_used, 0)) INTO v_all_closed
    FROM inventory.sap_out_items
    WHERE header_id = v_header_id;

    IF v_all_closed THEN
        UPDATE inventory.sap_out_header
        SET end_status = 'close'
        WHERE id = v_header_id;
    END IF;
END;
$$;


CREATE OR REPLACE PROCEDURE inventory.sp_edit_transaction_used(
    p_used_item_id BIGINT,
    p_used_header_id BIGINT,
    p_sap_out_item_id BIGINT,
    p_designator_id BIGINT,
    p_new_qty NUMERIC,
    p_old_qty NUMERIC,
    p_created_by VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_diff NUMERIC;
    v_qty_req NUMERIC;
    v_qty_used NUMERIC;
    v_header_id BIGINT;
    v_warehouse_id INT;
    v_id_trx VARCHAR;
    v_all_closed BOOLEAN;
BEGIN
    v_diff := p_new_qty - p_old_qty;
    
    IF v_diff = 0 THEN
        RETURN;
    END IF;

    -- 1. Fetch info from sap_out_items
    SELECT qty_req, COALESCE(qty_used, 0), header_id
    INTO v_qty_req, v_qty_used, v_header_id
    FROM inventory.sap_out_items
    WHERE id = p_sap_out_item_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item SAP Out tidak ditemukan.';
    END IF;

    -- 2. Validate qty
    IF v_qty_used + v_diff > v_qty_req THEN
        RAISE EXCEPTION 'QTY Used melebihi QTY Request. Tersisa %', (v_qty_req - v_qty_used);
    END IF;

    -- 3. Fetch warehouse & id_trx
    SELECT sap.warehouse_id, used.id_trx
    INTO v_warehouse_id, v_id_trx
    FROM inventory.transaction_used_header used
    JOIN inventory.sap_out_header sap ON sap.id = used.sap_out_id
    WHERE used.id = p_used_header_id;

    -- 4. Update or Insert transaction_used_item
    IF p_used_item_id IS NOT NULL THEN
        UPDATE inventory.transaction_used_item
        SET qty = p_new_qty
        WHERE id = p_used_item_id;
    ELSE
        INSERT INTO inventory.transaction_used_item (used_id, designator_id, qty)
        VALUES (p_used_header_id, p_designator_id, p_new_qty);
    END IF;

    -- 5. Update sap_out_items
    UPDATE inventory.sap_out_items
    SET qty_used = COALESCE(qty_used, 0) + v_diff
    WHERE id = p_sap_out_item_id;

    -- 6. Call sp_record_material_used (for audit movement)
    CALL inventory.sp_record_material_used(v_warehouse_id, p_designator_id::INT, v_diff, v_id_trx, 'Edit Rekon Qty', p_created_by);

    -- 7. Check if auto-close is needed
    SELECT bool_and(qty_req = COALESCE(qty_used, 0)) INTO v_all_closed
    FROM inventory.sap_out_items
    WHERE header_id = v_header_id;

    UPDATE inventory.sap_out_header
    SET end_status = CASE WHEN v_all_closed THEN 'close' ELSE 'intech' END
    WHERE id = v_header_id;
END;
$$;


CREATE OR REPLACE PROCEDURE inventory.sp_create_return_request(
    p_return_header_id BIGINT,
    p_sap_out_item_id BIGINT,
    p_designator_id BIGINT,
    p_qty NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_qty_req NUMERIC;
    v_qty_used NUMERIC;
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
    IF p_qty > (v_qty_req - v_qty_used) THEN
        RAISE EXCEPTION 'QTY Return melebihi sisa stok di teknisi. Tersisa %', (v_qty_req - v_qty_used);
    END IF;

    -- 3. Insert into return_material_items
    INSERT INTO inventory.return_material_items (header_id, designator_id, sap_out_item_id, qty)
    VALUES (p_return_header_id, p_designator_id, p_sap_out_item_id, p_qty);

END;
$$;
