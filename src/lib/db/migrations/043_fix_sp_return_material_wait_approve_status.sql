-- ============================================================================
-- Migration: 043_fix_sp_return_material_wait_approve_status.sql
-- Description: Update inventory.sp_return_material to accept 'wait_approve' status.
-- Migration 040 set new return requests to 'wait_approve', but sp_return_material
-- previously strictly checked 'pending'. This allows both 'wait_approve' and 'pending'.
-- Also adds row lock (FOR UPDATE) on return_material_header and validates accept ID input.
-- ============================================================================

CREATE OR REPLACE PROCEDURE inventory.sp_return_material(
    IN p_header_id bigint,
    IN p_accept_id character varying
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_warehouse_id BIGINT;
    v_id_trx VARCHAR;
    v_sap_out_id BIGINT;
    v_status VARCHAR;
    
    r_item RECORD;
    v_current_stock INT;
    v_new_stock INT;
    v_all_closed BOOLEAN;
BEGIN
    -- 0. Validate input parameters
    IF p_header_id IS NULL THEN
        RAISE EXCEPTION 'Header ID Return Material wajib diisi.';
    END IF;

    IF p_accept_id IS NULL OR trim(p_accept_id) = '' THEN
        RAISE EXCEPTION 'Accept ID wajib diisi.';
    END IF;

    -- 1. Get header info with row lock
    SELECT warehouse_id, id_trx, sap_out_id, end_status
    INTO v_warehouse_id, v_id_trx, v_sap_out_id, v_status
    FROM inventory.return_material_header
    WHERE id = p_header_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return Material Header ID % not found', p_header_id;
    END IF;
    
    -- Allow both 'wait_approve' (standard) and 'pending' (legacy)
    IF v_status NOT IN ('wait_approve', 'pending') THEN
        RAISE EXCEPTION 'Return Material is not pending or waiting approval (current status: %)', v_status;
    END IF;

    -- 2. Update Header Status
    UPDATE inventory.return_material_header
    SET end_status = 'accepted',
        accept_id = trim(p_accept_id),
        accept_time = NOW()
    WHERE id = p_header_id;

    -- 3. Loop through items
    FOR r_item IN (
        SELECT id, designator_id, sap_out_item_id, qty
        FROM inventory.return_material_items
        WHERE header_id = p_header_id
        ORDER BY id
    ) LOOP
        
        -- a. Upsert stock_balance
        INSERT INTO inventory.stock_balance (warehouse_id, designator_id, qty_stock, updated_at)
        VALUES (v_warehouse_id, r_item.designator_id, r_item.qty, NOW())
        ON CONFLICT (warehouse_id, designator_id)
        DO UPDATE SET 
            qty_stock = inventory.stock_balance.qty_stock + r_item.qty,
            updated_at = NOW()
        RETURNING qty_stock INTO v_new_stock;
        
        -- b. Insert stock_movement
        INSERT INTO inventory.stock_movement (
            warehouse_id, designator_id, movement_type, qty_delta, qty_after, reference_trx, notes, created_by
        ) VALUES (
            v_warehouse_id, r_item.designator_id, 'return', r_item.qty, v_new_stock, v_id_trx, 'Return from technician', trim(p_accept_id)
        );
        
        -- c. Update sap_out_items.qty_used
        UPDATE inventory.sap_out_items
        SET qty_used = COALESCE(qty_used, 0) + r_item.qty
        WHERE id = r_item.sap_out_item_id;
        
    END LOOP;
    
    -- 4. Check if sap_out_header can be closed
    SELECT bool_and(qty_req = COALESCE(qty_used, 0))
    INTO v_all_closed
    FROM inventory.sap_out_items
    WHERE header_id = v_sap_out_id;
    
    IF v_all_closed THEN
        UPDATE inventory.sap_out_header
        SET end_status = 'close'
        WHERE id = v_sap_out_id;
    END IF;
    
END;
$procedure$;

-- Defense-in-depth: revoke execute from public and grant explicitly to imam
REVOKE EXECUTE ON PROCEDURE inventory.sp_return_material(bigint, character varying) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE inventory.sp_return_material(bigint, character varying) TO imam;
