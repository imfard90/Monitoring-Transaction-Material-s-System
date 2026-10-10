-- Migration: Resolve D5 — rename per-item PROCEDURE sp_create_return_request → sp_insert_return_item
-- Description: Migration 004 created PROCEDURE inventory.sp_create_return_request (per-item insert).
--              Migration 007 created FUNCTION inventory.sp_create_return_request (header + loop calls PROCEDURE).
--              Same name for PROCEDURE and FUNCTION causes confusion and potential resolution errors.
--
-- Fix: Rename the per-item PROCEDURE to sp_insert_return_item and update FUNCTION 007 to call new name.
--
-- Note: DROP + CREATE is used instead of ALTER RENAME because the PROCEDURE is called by name in the FUNCTION body.
-- We recreate both with clean signatures.

-- 1. Drop the old per-item PROCEDURE (migration 004)
DROP PROCEDURE IF EXISTS inventory.sp_create_return_request(
    p_return_header_id BIGINT,
    p_sap_out_item_id BIGINT,
    p_designator_id BIGINT,
    p_qty NUMERIC
);

-- 2. Create renamed per-item PROCEDURE
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
BEGIN
    -- 1. Fetch info sap_out_items (with lock)
    SELECT qty_req, COALESCE(qty_used, 0)
    INTO v_qty_req, v_qty_used
    FROM inventory.sap_out_items
    WHERE id = p_sap_out_item_id
    FOR UPDATE;

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

-- 3. Recreate FUNCTION with updated internal CALL to renamed PROCEDURE
CREATE OR REPLACE FUNCTION inventory.sp_create_return_request(
    p_sap_out_id BIGINT,
    p_nik_teknisi VARCHAR,
    p_warehouse_id BIGINT,
    p_notes TEXT,
    p_items JSONB,
    p_created_by VARCHAR
)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    v_header_id BIGINT;
    v_id_trx VARCHAR;
    v_item JSONB;
BEGIN
    -- Generate ID Trx
    v_id_trx := 'RET-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || floor(random() * 1000)::text;

    -- Insert Header
    INSERT INTO inventory.return_material_header (
        id_trx, sap_out_id, nik_teknisi, warehouse_id, notes, created_by
    )
    VALUES (
        v_id_trx, p_sap_out_id, p_nik_teknisi, p_warehouse_id, p_notes, p_created_by
    )
    RETURNING id INTO v_header_id;

    -- Loop through items and call renamed per-item PROCEDURE
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        CALL inventory.sp_insert_return_item(
            v_header_id,
            (v_item->>'sap_out_item_id')::BIGINT,
            (v_item->>'designator_id')::BIGINT,
            (v_item->>'qty')::NUMERIC
        );
    END LOOP;

    RETURN v_id_trx;
END;
$$;
