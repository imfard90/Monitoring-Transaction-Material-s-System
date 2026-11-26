-- ============================================================================
-- Migration: 066_fallback_return_material_to_all_intech.sql
-- Description: Upgrade inventory.sp_return_material with fallback mechanism
--              across all open Intech (SAP Out) of the technician.
--
-- Background:
-- When a return material request is created, it is bound to a specific sap_out_item_id.
-- If subsequent transactions (e.g. Rekon Lensa / Rekon Intech) consume the quota of that
-- specific item before the return is physically accepted/approved, the return previously
-- failed with "sap_out_items_qty_used_le_req" check constraint violation.
--
-- This migration upgrades sp_return_material to:
-- 1. Deduct from the original sap_out_item_id up to its available remaining quota.
-- 2. If the remaining quota is insufficient (v_qty_needed > 0), automatically fallback
--    to any open SAP Out items (end_status = 'intech') for the same technician and material.
--    Prioritizes the same warehouse, then FIFO by request_time.
-- 3. Re-links return_material_items.sap_out_item_id to the fallback item and appends
--    an audit trace in return_material_header.notes.
-- 4. Only raises an exception if the technician's total Intech stock across all open
--    SAP Out records is insufficient.
--
-- Rollback:
-- Re-apply definition from 047_add_nik_accept_and_audit_inout_tag.sql lines 228-330.
-- ============================================================================

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
    v_nik_teknisi VARCHAR;
    v_status VARCHAR;
    v_clean_accept_id VARCHAR;
    v_clean_nik VARCHAR;
    
    r_item RECORD;
    r_fallback RECORD;
    v_current_stock INT;
    v_new_stock INT;
    v_all_closed BOOLEAN;
    v_qty_needed NUMERIC;
    v_qty_req NUMERIC;
    v_qty_used NUMERIC;
    v_available NUMERIC;
    v_deduct NUMERIC;
    v_reallocated_soi_id BIGINT;
    v_fallback_notes TEXT := '';
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
    SELECT warehouse_id, id_trx, sap_out_id, nik_teknisi, end_status
    INTO v_warehouse_id, v_id_trx, v_sap_out_id, v_nik_teknisi, v_status
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
        
        -- c. Update sap_out_items.qty_used dengan Fallback ke seluruh Intech teknisi
        v_qty_needed := r_item.qty;
        v_reallocated_soi_id := NULL;

        -- Step 1: Coba kurangi dari sap_out_item_id awal yang tercatat di return
        IF r_item.sap_out_item_id IS NOT NULL THEN
            SELECT qty_req, COALESCE(qty_used, 0)
            INTO v_qty_req, v_qty_used
            FROM inventory.sap_out_items
            WHERE id = r_item.sap_out_item_id
            FOR UPDATE;

            IF FOUND THEN
                v_available := GREATEST(v_qty_req - v_qty_used, 0);
                IF v_available > 0 THEN
                    v_deduct := LEAST(v_qty_needed, v_available);
                    UPDATE inventory.sap_out_items
                    SET qty_used = qty_used + v_deduct
                    WHERE id = r_item.sap_out_item_id;

                    v_qty_needed := v_qty_needed - v_deduct;
                    v_reallocated_soi_id := r_item.sap_out_item_id;
                END IF;
            END IF;
        END IF;

        -- Step 2: Fallback membaca seluruh Intech (SAP Out) teknisi tersebut jika sisa kuota masih dibutuhkan
        IF v_qty_needed > 0 THEN
            FOR r_fallback IN (
                SELECT soi.id, soi.header_id, soi.qty_req, COALESCE(soi.qty_used, 0) as qty_used, soh.sap_number
                FROM inventory.sap_out_items soi
                JOIN inventory.sap_out_header soh ON soh.id = soi.header_id
                WHERE soh.nik_teknisi = v_nik_teknisi
                  AND (r_item.sap_out_item_id IS NULL OR soi.id != r_item.sap_out_item_id)
                  AND soi.designator_id = r_item.designator_id
                  AND soi.qty_req > COALESCE(soi.qty_used, 0)
                  AND soh.end_status = 'intech'
                ORDER BY 
                    CASE WHEN soh.warehouse_id = v_warehouse_id THEN 0 ELSE 1 END,
                    soh.request_time ASC, 
                    soi.id ASC
                FOR UPDATE OF soi
            ) LOOP
                v_available := r_fallback.qty_req - r_fallback.qty_used;
                v_deduct := LEAST(v_qty_needed, v_available);

                UPDATE inventory.sap_out_items
                SET qty_used = qty_used + v_deduct
                WHERE id = r_fallback.id;

                v_qty_needed := v_qty_needed - v_deduct;

                -- Jika item return semula tidak dapat alokasi sama sekali dari sap_out_item_id awal,
                -- update referensi sap_out_item_id di return_material_items ke item fallback ini
                IF v_reallocated_soi_id IS NULL THEN
                    v_reallocated_soi_id := r_fallback.id;
                    UPDATE inventory.return_material_items
                    SET sap_out_item_id = r_fallback.id
                    WHERE id = r_item.id;
                END IF;

                v_fallback_notes := v_fallback_notes || ' [Item ' || r_item.id || ' dialihkan ke SAP ' || COALESCE(r_fallback.sap_number, r_fallback.header_id::text) || ']';

                -- Auto-close sap_out_header jika seluruh item telah terpenuhi
                IF (r_fallback.qty_used + v_deduct) >= r_fallback.qty_req THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM inventory.sap_out_items
                        WHERE header_id = r_fallback.header_id
                          AND qty_req > COALESCE(qty_used, 0)
                    ) THEN
                        UPDATE inventory.sap_out_header
                        SET end_status = 'close'
                        WHERE id = r_fallback.header_id;
                    END IF;
                END IF;

                EXIT WHEN v_qty_needed <= 0;
            END LOOP;
        END IF;

        -- Step 3: Jika setelah memeriksa seluruh Intech teknisi masih ada kekurangan
        IF v_qty_needed > 0 THEN
            RAISE EXCEPTION 'Sisa stok Intech teknisi % untuk material (designator_id: %) tidak mencukupi untuk return. Kurang % kuota.',
                v_nik_teknisi, r_item.designator_id, v_qty_needed;
        END IF;
        
    END LOOP;

    -- Append audit note if fallback occurred
    IF v_fallback_notes != '' THEN
        UPDATE inventory.return_material_header
        SET notes = COALESCE(notes, '') || v_fallback_notes
        WHERE id = p_header_id;
    END IF;
    
    -- 4. Check if original sap_out_header can be closed
    IF v_sap_out_id IS NOT NULL THEN
        SELECT bool_and(qty_req = COALESCE(qty_used, 0))
        INTO v_all_closed
        FROM inventory.sap_out_items
        WHERE header_id = v_sap_out_id;
        
        IF v_all_closed THEN
            UPDATE inventory.sap_out_header
            SET end_status = 'close'
            WHERE id = v_sap_out_id;
        END IF;
    END IF;
    
END;
$procedure$;

-- Security & Permissions
REVOKE EXECUTE ON PROCEDURE inventory.sp_return_material(bigint, character varying, character varying) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE inventory.sp_return_material(bigint, character varying, character varying) TO imam;
