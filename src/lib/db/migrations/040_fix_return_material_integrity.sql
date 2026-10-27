-- Migration: 040_fix_return_material_integrity.sql
-- Description: Fixes return material integrity, sequence determinism, and adds non-negative stock constraint.
-- 1. Create sequence inventory.trx_return_seq for deterministic transaction IDs.
-- 2. Add CHECK constraint (qty_stock >= 0) to inventory.stock_balance.
-- 3. Update inventory.sp_insert_return_item to prevent over-return across multiple requests.
-- 4. Update inventory.sp_create_return_request to generate deterministic TRX-RETURN-{nik}-{intls}-{yymm}{seq}.

-- ============================================================================
-- 1. Create Sequence for Return Transactions
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS inventory.trx_return_seq NO CYCLE MAXVALUE 9999;

-- ============================================================================
-- 2. Add Non-Negative Stock Balance Constraint
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stock_balance_qty_non_negative'
    ) THEN
        ALTER TABLE inventory.stock_balance
        ADD CONSTRAINT stock_balance_qty_non_negative
        CHECK (qty_stock >= 0);
    END IF;
END $$;

-- ============================================================================
-- 3. Update sp_insert_return_item with Cumulative Return Validation
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
    v_qty_already_returned NUMERIC;
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

    -- 3. Fetch cumulative returns already recorded for this sap_out_item_id
    SELECT COALESCE(SUM(qty), 0)
    INTO v_qty_already_returned
    FROM inventory.return_material_items
    WHERE sap_out_item_id = p_sap_out_item_id;

    -- 4. Calculate remaining available quantity for return
    v_qty_available := v_qty_req - v_qty_used - v_qty_already_returned;

    IF p_qty > v_qty_available THEN
        RAISE EXCEPTION 'QTY Return (%) melebihi sisa stok di teknisi. Tersedia untuk return: % (Req: %, Terpakai: %, Sudah Direturn: %)',
            p_qty, v_qty_available, v_qty_req, v_qty_used, v_qty_already_returned;
    END IF;

    -- 5. Insert into return_material_items
    INSERT INTO inventory.return_material_items (header_id, designator_id, sap_out_item_id, qty)
    VALUES (p_return_header_id, p_designator_id, p_sap_out_item_id, p_qty);
END;
$$;

-- ============================================================================
-- 4. Update sp_create_return_request with Standard Deterministic ID
-- ============================================================================
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
    v_intls VARCHAR;
    v_yymm VARCHAR;
    v_seq VARCHAR;
    v_item JSONB;
BEGIN
    -- 1. Fetch warehouse initials
    SELECT COALESCE(NULLIF(intls, ''), 'WH')
    INTO v_intls
    FROM inventory.mas_wh
    WHERE id = p_warehouse_id;

    IF NOT FOUND THEN
        v_intls := 'WH';
    END IF;

    -- 2. Generate YYMM and Sequence
    v_yymm := to_char(CURRENT_TIMESTAMP, 'YYMM');
    SELECT to_char(nextval('inventory.trx_return_seq'), 'FM0000') INTO v_seq;

    -- Standard format: TRX-RETURN-{nik_teknisi}-{intls}-{yymm}{seq}
    v_id_trx := 'TRX-RETURN-' || p_nik_teknisi || '-' || v_intls || '-' || v_yymm || v_seq;

    -- 3. Insert Header
    INSERT INTO inventory.return_material_header (
        id_trx, sap_out_id, nik_teknisi, warehouse_id, notes, created_by, created_at, end_status
    )
    VALUES (
        v_id_trx, p_sap_out_id, p_nik_teknisi, p_warehouse_id, p_notes, p_created_by, NOW(), 'wait_approve'
    )
    RETURNING id INTO v_header_id;

    -- 4. Loop through items and call per-item procedure
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

-- Revoke public execution and grant to imam
REVOKE EXECUTE ON PROCEDURE inventory.sp_insert_return_item(BIGINT, BIGINT, BIGINT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE inventory.sp_insert_return_item(BIGINT, BIGINT, BIGINT, NUMERIC) TO imam;

REVOKE EXECUTE ON FUNCTION inventory.sp_create_return_request(BIGINT, VARCHAR, BIGINT, TEXT, JSONB, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inventory.sp_create_return_request(BIGINT, VARCHAR, BIGINT, TEXT, JSONB, VARCHAR) TO imam;
