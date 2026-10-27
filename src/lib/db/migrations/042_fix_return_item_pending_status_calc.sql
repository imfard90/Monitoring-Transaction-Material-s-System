-- ============================================================================
-- Migration: 042_fix_return_item_pending_status_calc.sql
-- Description: Fix double-counting in inventory.sp_insert_return_item.
-- Accepted returns are ALREADY incorporated into sap_out_items.qty_used by sp_return_material.
-- Therefore, cumulative pending return checks must only count return requests with end_status IN ('wait_approve', 'pending').
-- ============================================================================

CREATE OR REPLACE PROCEDURE inventory.sp_insert_return_item(
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
    v_qty_pending_returned NUMERIC;
    v_qty_available NUMERIC;
BEGIN
    -- 1. Fetch info sap_out_items (with row lock)
    SELECT qty_req, COALESCE(qty_used, 0)
    INTO v_qty_req, v_qty_used
    FROM inventory.sap_out_items
    WHERE id = p_sap_out_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item SAP Out id=% tidak ditemukan.', p_sap_out_item_id;
    END IF;

    -- 2. Validate input quantity
    IF p_qty <= 0 THEN
        RAISE EXCEPTION 'QTY Return harus lebih besar dari 0.';
    END IF;

    -- 3. Fetch cumulative pending/in-flight returns for this sap_out_item_id
    -- (Note: accepted returns are already incorporated into sap_out_items.qty_used via sp_return_material)
    SELECT COALESCE(SUM(rmi.qty), 0)
    INTO v_qty_pending_returned
    FROM inventory.return_material_items rmi
    JOIN inventory.return_material_header rmh ON rmh.id = rmi.header_id
    WHERE rmi.sap_out_item_id = p_sap_out_item_id
      AND rmh.end_status IN ('wait_approve', 'pending');

    -- 4. Calculate remaining available quantity for return
    v_qty_available := v_qty_req - v_qty_used - v_qty_pending_returned;

    IF p_qty > v_qty_available THEN
        RAISE EXCEPTION 'QTY Return (%) melebihi sisa stok di teknisi. Tersedia untuk return: % (Req: %, Selesai: %, Pending Return: %)',
            p_qty, v_qty_available, v_qty_req, v_qty_used, v_qty_pending_returned;
    END IF;

    -- 5. Insert into return_material_items
    INSERT INTO inventory.return_material_items (header_id, designator_id, sap_out_item_id, qty)
    VALUES (p_return_header_id, p_designator_id, p_sap_out_item_id, p_qty);
END;
$$;
