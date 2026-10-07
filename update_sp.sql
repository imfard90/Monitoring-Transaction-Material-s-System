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

    -- 4. Update sap_out_items.qty_used immediately so technician stock decreases
    UPDATE inventory.sap_out_items
    SET qty_used = COALESCE(qty_used, 0) + p_qty
    WHERE id = p_sap_out_item_id;
END;
$$;
