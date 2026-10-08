CREATE OR REPLACE PROCEDURE inventory.sp_update_inout_tag(IN p_header_id integer, IN p_action character varying, IN p_action_id character varying, IN p_items_json jsonb)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_header RECORD;
    v_item RECORD;
BEGIN
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
        SET request_id = p_action_id
        WHERE id = p_header_id;

        -- Replace existing 'request' items
        DELETE FROM inventory.inout_tag_items
        WHERE header_id = p_header_id AND action = 'request';

        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_json) AS x(designator_id INT, qty NUMERIC)
        LOOP
            INSERT INTO inventory.inout_tag_items (
                header_id, action, action_id, designator_id, qty
            ) VALUES (
                p_header_id, 'request', p_action_id, v_item.designator_id, v_item.qty
            );
        END LOOP;

    ELSIF p_action = 'send' THEN
        IF v_header.send_id IS NOT NULL THEN
            RAISE EXCEPTION 'Send ID already exists. Cannot update send action.';
        END IF;

        -- Update header
        UPDATE inventory.inout_tag_header
        SET send_id = p_action_id,
            send_time = CURRENT_TIMESTAMP,
            end_status = 'in_transit'
        WHERE id = p_header_id;

        -- Insert new 'send' items
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_json) AS x(designator_id INT, qty NUMERIC)
        LOOP
            INSERT INTO inventory.inout_tag_items (
                header_id, action, action_id, designator_id, qty
            ) VALUES (
                p_header_id, 'send', p_action_id, v_item.designator_id, v_item.qty
            );
        END LOOP;

    ELSIF p_action = 'accept' THEN
        IF v_header.accept_id IS NOT NULL THEN
            RAISE EXCEPTION 'Accept ID already exists. Cannot update accept action.';
        END IF;

        -- Update header → closed
        UPDATE inventory.inout_tag_header
        SET accept_id = p_action_id,
            accept_time = CURRENT_TIMESTAMP,
            end_status = 'closed'
        WHERE id = p_header_id;

        -- Insert new 'accept' items
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items_json) AS x(designator_id INT, qty NUMERIC)
        LOOP
            INSERT INTO inventory.inout_tag_items (
                header_id, action, action_id, designator_id, qty
            ) VALUES (
                p_header_id, 'accept', p_action_id, v_item.designator_id, v_item.qty
            );
        END LOOP;

        -- ═══════════════════════════════════════════════════════════════
        -- NEW: Update stock_balance & stock_movement saat TAG closed
        -- transfer_out (conditional from_wh) + transfer_in (always to_wh)
        -- ═══════════════════════════════════════════════════════════════
        CALL inventory.sp_close_inout_tag(p_header_id, p_action_id);

    ELSE
        RAISE EXCEPTION 'Unknown action type: %', p_action;
    END IF;

END;
$procedure$;
