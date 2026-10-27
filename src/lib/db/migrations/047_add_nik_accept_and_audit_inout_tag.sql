-- Migration 047: Add nik_accept to inout_tag_header & return_material_header,
-- and update SPs for audit tracking (created_by, nik_send, nik_accept, and cancellation notes).

-- 1. Add nik_accept column to inventory.inout_tag_header and inventory.return_material_header
ALTER TABLE inventory.inout_tag_header
    ADD COLUMN IF NOT EXISTS nik_accept VARCHAR(50);

ALTER TABLE inventory.return_material_header
    ADD COLUMN IF NOT EXISTS nik_accept VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_inout_tag_header_nik_send
    ON inventory.inout_tag_header (nik_send)
    WHERE nik_send IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inout_tag_header_nik_accept
    ON inventory.inout_tag_header (nik_accept)
    WHERE nik_accept IS NOT NULL;

-- 2. Drop old SP overloads to prevent ambiguous signature errors
DROP PROCEDURE IF EXISTS inventory.sp_create_inout_tag(bigint, bigint, character varying, character varying, numeric, jsonb, character varying);
DROP PROCEDURE IF EXISTS inventory.sp_create_inout_tag(bigint, bigint, character varying, character varying, numeric, jsonb, character varying, character varying);

DROP PROCEDURE IF EXISTS inventory.sp_update_inout_tag(integer, character varying, character varying, jsonb);
DROP PROCEDURE IF EXISTS inventory.sp_update_inout_tag(integer, character varying, character varying, jsonb, character varying);

DROP PROCEDURE IF EXISTS inventory.sp_return_material(bigint, character varying);
DROP PROCEDURE IF EXISTS inventory.sp_return_material(bigint, character varying, character varying);

-- 3. Create updated sp_create_inout_tag with p_created_by parameter
CREATE OR REPLACE PROCEDURE inventory.sp_create_inout_tag(
    IN p_from_wh_id bigint,
    IN p_to_wh_id bigint,
    IN p_request_id character varying,
    IN p_vendor_name character varying,
    IN p_cost numeric,
    IN p_items_json jsonb,
    OUT p_id_trx character varying,
    IN p_created_by character varying DEFAULT NULL
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_header_id bigint;
    v_item jsonb;
    v_origin_code varchar;
    v_dest_code varchar;
    v_yymm varchar;
    v_count int;
    v_seq varchar;
    v_clean_creator varchar;
    v_clean_vendor varchar;
    v_clean_req_id varchar;
BEGIN
    v_clean_creator := NULLIF(TRIM(p_created_by), '');
    v_clean_vendor := NULLIF(TRIM(p_vendor_name), '');
    v_clean_req_id := NULLIF(TRIM(p_request_id), '');

    -- 1. Get warehouse codes
    IF p_from_wh_id IS NULL THEN
        v_origin_code := 'VNDR';
    ELSE
        SELECT intls INTO v_origin_code FROM inventory.mas_wh WHERE id = p_from_wh_id;
    END IF;

    IF p_to_wh_id IS NULL THEN
        v_dest_code := 'VNDR';
    ELSE
        SELECT intls INTO v_dest_code FROM inventory.mas_wh WHERE id = p_to_wh_id;
    END IF;

    -- 2. Generate Sequence
    v_yymm := to_char(CURRENT_TIMESTAMP, 'YYMM');
    
    SELECT COUNT(*) + 1 INTO v_count 
    FROM inventory.inout_tag_header 
    WHERE to_char(request_time, 'YYMM') = v_yymm;
    
    v_seq := lpad(v_count::text, 4, '0');
    
    -- 3. Construct ID
    p_id_trx := 'TRX-TAG-' || COALESCE(v_origin_code, 'WH') || '-' || COALESCE(v_dest_code, 'WH') || '-' || v_yymm || v_seq;

    -- 4. Insert Header (Audit: created_by populated with creator NIK or vendor)
    INSERT INTO inventory.inout_tag_header (
        id_trx, from_wh_id, to_wh_id, request_id, end_status, created_by
    ) VALUES (
        p_id_trx, p_from_wh_id, p_to_wh_id, v_clean_req_id, 'requested', COALESCE(v_clean_creator, v_clean_vendor)
    ) RETURNING id INTO v_header_id;

    -- If vendor is specified, record to vendor_tracking as well
    IF v_clean_vendor IS NOT NULL THEN
        INSERT INTO inventory.vendor_tracking (header_id, name_vendor, cost)
        VALUES (v_header_id, v_clean_vendor, p_cost);
    END IF;

    -- 5. Insert Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_json)
    LOOP
        INSERT INTO inventory.inout_tag_items (
            header_id, designator_id, qty, unit_price, action, action_id
        ) VALUES (
            v_header_id, 
            (v_item->>'designator_id')::bigint, 
            (v_item->>'qty')::int, 
            p_cost, 
            COALESCE((v_item->>'action'), 'request')::inventory.enum_transaction,
            COALESCE(NULLIF(TRIM(v_item->>'action_id'), ''), '-')
        );
    END LOOP;
END;
$procedure$;

-- 4. Create updated sp_update_inout_tag with p_user_nik parameter
CREATE OR REPLACE PROCEDURE inventory.sp_update_inout_tag(
    IN p_header_id integer,
    IN p_action character varying,
    IN p_action_id character varying,
    IN p_items_json jsonb,
    IN p_user_nik character varying DEFAULT NULL
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_header RECORD;
    v_item RECORD;
    v_clean_action_id character varying;
    v_clean_nik character varying;
BEGIN
    v_clean_action_id := TRIM(p_action_id);
    v_clean_nik := NULLIF(TRIM(p_user_nik), '');

    -- 1. Lock the header record
    SELECT * INTO v_header
    FROM inventory.inout_tag_header
    WHERE id = p_header_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction header not found.';
    END IF;

    -- 2. Anti-Rollback & State Validation
    IF v_header.end_status = 'closed' THEN
        RAISE EXCEPTION 'Cannot update a closed transaction.';
    END IF;
    IF v_header.end_status = 'cancel' THEN
        RAISE EXCEPTION 'Cannot update a cancelled transaction.';
    END IF;

    IF p_action = 'request' THEN
        IF v_header.request_id IS NOT NULL THEN
            RAISE EXCEPTION 'Request ID already exists. Cannot update request action.';
        END IF;

        -- Update header
        UPDATE inventory.inout_tag_header
        SET request_id = v_clean_action_id
        WHERE id = p_header_id;

        -- Replace existing 'request' items
        DELETE FROM inventory.inout_tag_items
        WHERE header_id = p_header_id AND action = 'request';

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_json) AS x(designator_id INT, qty NUMERIC)
        LOOP
            INSERT INTO inventory.inout_tag_items (
                header_id, action, action_id, designator_id, qty
            ) VALUES (
                p_header_id, 'request', v_clean_action_id, v_item.designator_id, v_item.qty
            );
        END LOOP;

    ELSIF p_action = 'send' THEN
        IF v_header.send_id IS NOT NULL THEN
            RAISE EXCEPTION 'Send ID already exists. Cannot update send action.';
        END IF;

        -- Update header (Audit: record nik_send)
        UPDATE inventory.inout_tag_header
        SET send_id = v_clean_action_id,
            send_time = CURRENT_TIMESTAMP,
            nik_send = COALESCE(v_clean_nik, nik_send),
            end_status = 'in_transit'
        WHERE id = p_header_id;

        -- Insert new 'send' items
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_json) AS x(designator_id INT, qty NUMERIC)
        LOOP
            INSERT INTO inventory.inout_tag_items (
                header_id, action, action_id, designator_id, qty
            ) VALUES (
                p_header_id, 'send', v_clean_action_id, v_item.designator_id, v_item.qty
            );
        END LOOP;

    ELSIF p_action = 'accept' THEN
        IF v_header.accept_id IS NOT NULL THEN
            RAISE EXCEPTION 'Accept ID already exists. Cannot update accept action.';
        END IF;

        -- Update header (Audit: record nik_accept)
        UPDATE inventory.inout_tag_header
        SET accept_id = v_clean_action_id,
            accept_time = CURRENT_TIMESTAMP,
            nik_accept = COALESCE(v_clean_nik, nik_accept),
            end_status = 'closed'
        WHERE id = p_header_id;

        -- Insert new 'accept' items
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_json) AS x(designator_id INT, qty NUMERIC)
        LOOP
            INSERT INTO inventory.inout_tag_items (
                header_id, action, action_id, designator_id, qty
            ) VALUES (
                p_header_id, 'accept', v_clean_action_id, v_item.designator_id, v_item.qty
            );
        END LOOP;

        -- Update stock_balance & stock_movement saat TAG closed
        CALL inventory.sp_close_inout_tag(p_header_id, COALESCE(v_clean_nik, v_clean_action_id));

    ELSE
        RAISE EXCEPTION 'Unknown action type: %', p_action;
    END IF;

END;
$procedure$;

-- 5. Create updated sp_return_material with p_user_nik parameter
CREATE OR REPLACE PROCEDURE inventory.sp_return_material(
    IN p_header_id bigint, 
    IN p_accept_id character varying,
    IN p_user_nik character varying DEFAULT NULL
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_warehouse_id BIGINT;
    v_id_trx VARCHAR;
    v_sap_out_id BIGINT;
    v_status VARCHAR;
    v_clean_accept_id VARCHAR;
    v_clean_nik VARCHAR;
    
    r_item RECORD;
    v_current_stock INT;
    v_new_stock INT;
    v_all_closed BOOLEAN;
BEGIN
    -- 0. Validate input parameters
    IF p_header_id IS NULL THEN
        RAISE EXCEPTION 'Header ID Return Material wajib diisi.';
    END IF;

    v_clean_accept_id := TRIM(p_accept_id);
    v_clean_nik := NULLIF(TRIM(p_user_nik), '');

    IF v_clean_accept_id IS NULL OR v_clean_accept_id = '' THEN
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

    -- 2. Update Header Status (Audit: record nik_accept)
    UPDATE inventory.return_material_header
    SET end_status = 'accepted',
        accept_id = v_clean_accept_id,
        nik_accept = COALESCE(v_clean_nik, nik_accept),
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
            v_warehouse_id, r_item.designator_id, 'return', r_item.qty, v_new_stock, v_id_trx, 'Return from technician', COALESCE(v_clean_nik, v_clean_accept_id)
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

-- 6. Create sp_cancel_inout_tag for atomic cancellation with mandatory reason audit
CREATE OR REPLACE PROCEDURE inventory.sp_cancel_inout_tag(
    IN p_header_id bigint,
    IN p_type varchar,
    IN p_reason text,
    IN p_user_nik varchar
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_existing_notes text;
    v_current_status text;
    v_new_notes text;
    v_clean_reason text;
    v_clean_nik text;
BEGIN
    v_clean_reason := TRIM(p_reason);
    v_clean_nik := NULLIF(TRIM(p_user_nik), '');

    IF v_clean_reason IS NULL OR LENGTH(v_clean_reason) < 5 THEN
        RAISE EXCEPTION 'Alasan pembatalan wajib diisi (minimal 5 karakter).';
    END IF;

    IF p_type = 'return' THEN
        SELECT notes, end_status INTO v_existing_notes, v_current_status
        FROM inventory.return_material_header
        WHERE id = p_header_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Transaksi return material id=% tidak ditemukan.', p_header_id;
        END IF;

        IF v_current_status IN ('closed', 'accepted') THEN
            RAISE EXCEPTION 'Tidak dapat membatalkan transaksi yang sudah selesai/diterima.';
        END IF;

        IF v_current_status = 'cancel' THEN
            RAISE EXCEPTION 'Transaksi sudah dalam status batal.';
        END IF;

        IF v_existing_notes IS NOT NULL AND TRIM(v_existing_notes) != '' THEN
            v_new_notes := v_existing_notes || ' | [BATAL - ' || COALESCE(v_clean_nik, 'UNKNOWN') || ']: ' || v_clean_reason;
        ELSE
            v_new_notes := '[BATAL - ' || COALESCE(v_clean_nik, 'UNKNOWN') || ']: ' || v_clean_reason;
        END IF;

        UPDATE inventory.return_material_header
        SET end_status = 'cancel',
            notes = v_new_notes
        WHERE id = p_header_id;
    ELSE
        SELECT notes, end_status::text INTO v_existing_notes, v_current_status
        FROM inventory.inout_tag_header
        WHERE id = p_header_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Transaksi inout tag id=% tidak ditemukan.', p_header_id;
        END IF;

        IF v_current_status = 'closed' THEN
            RAISE EXCEPTION 'Tidak dapat membatalkan transaksi yang sudah closed.';
        END IF;

        IF v_current_status = 'cancel' THEN
            RAISE EXCEPTION 'Transaksi sudah dalam status batal.';
        END IF;

        IF v_existing_notes IS NOT NULL AND TRIM(v_existing_notes) != '' THEN
            v_new_notes := v_existing_notes || ' | [BATAL - ' || COALESCE(v_clean_nik, 'UNKNOWN') || ']: ' || v_clean_reason;
        ELSE
            v_new_notes := '[BATAL - ' || COALESCE(v_clean_nik, 'UNKNOWN') || ']: ' || v_clean_reason;
        END IF;

        UPDATE inventory.inout_tag_header
        SET end_status = 'cancel',
            notes = v_new_notes
        WHERE id = p_header_id;
    END IF;
END;
$procedure$;

-- 7. Security: Revoke execute from PUBLIC on all procedures in schema inventory
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA inventory FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory FROM PUBLIC;
