-- Migration: Rekon Lensa V2
-- Description: Creates rekon_used_header and rekon_used_list tables, and sp_record_rekon_lensa_v2

CREATE TABLE IF NOT EXISTS inventory.rekon_used_header (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_trx VARCHAR NOT NULL,
    id_pemakaian VARCHAR NOT NULL,
    wo_number VARCHAR,
    wo_type VARCHAR,
    nik_teknisi VARCHAR,
    name_gudang VARCHAR,
    name_sa VARCHAR,
    notes TEXT,
    create_at TIMESTAMPTZ DEFAULT NOW(),
    create_by VARCHAR
);

CREATE TABLE IF NOT EXISTS inventory.rekon_used_list (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rekon_used_id BIGINT NOT NULL REFERENCES inventory.rekon_used_header(id) ON DELETE CASCADE,
    out_sap VARCHAR,
    designator_id VARCHAR NOT NULL REFERENCES inventory.materials(code),
    qty NUMERIC NOT NULL,
    unit_price NUMERIC,
    create_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookup
CREATE INDEX IF NOT EXISTS idx_rekon_used_header_id_trx ON inventory.rekon_used_header(id_trx);
CREATE INDEX IF NOT EXISTS idx_rekon_used_list_rekon_used_id ON inventory.rekon_used_list(rekon_used_id);

-- Stored Procedure
CREATE OR REPLACE PROCEDURE inventory.sp_record_rekon_lensa_v2(
    p_id_trx VARCHAR,
    p_id_pemakaian VARCHAR,
    p_wo_number VARCHAR,
    p_wo_type VARCHAR,
    p_nik_teknisi VARCHAR,
    p_name_gudang VARCHAR,
    p_name_sa VARCHAR,
    p_notes TEXT,
    p_create_by VARCHAR,
    p_materials JSON
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_header_id BIGINT;
    v_material_id INT;
    v_sap_out_id BIGINT;
    v_warehouse_id INT;
    v_remaining_qty NUMERIC;
    v_item RECORD;
    v_deduct_qty NUMERIC;
    v_all_closed BOOLEAN;
    v_mat RECORD;
BEGIN
    -- 1. Check if header already exists for this id_trx
    SELECT id INTO v_header_id
    FROM inventory.rekon_used_header
    WHERE id_trx = p_id_trx;

    IF NOT FOUND THEN
        INSERT INTO inventory.rekon_used_header (
            id_trx, id_pemakaian, wo_number, wo_type, nik_teknisi, name_gudang, name_sa, notes, create_by
        ) VALUES (
            p_id_trx, p_id_pemakaian, p_wo_number, p_wo_type, p_nik_teknisi, p_name_gudang, p_name_sa, p_notes, p_create_by
        ) RETURNING id INTO v_header_id;
    END IF;

    -- Loop through materials JSON array
    FOR v_mat IN SELECT * FROM json_populate_recordset(null::record, p_materials) AS (out_sap VARCHAR, designator_id VARCHAR, qty NUMERIC, unit_price NUMERIC)
    LOOP
        v_remaining_qty := v_mat.qty;

        -- 2. Get material ID from code
        SELECT id INTO v_material_id
        FROM inventory.materials
        WHERE code = v_mat.designator_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Material dengan code % tidak ditemukan.', v_mat.designator_id;
        END IF;

        -- 3. Insert into rekon_used_list
        INSERT INTO inventory.rekon_used_list (
            rekon_used_id, out_sap, designator_id, qty, unit_price
        ) VALUES (
            v_header_id, v_mat.out_sap, v_mat.designator_id, v_mat.qty, v_mat.unit_price
        );

        -- 4. Find sap_out_header
        SELECT id, warehouse_id INTO v_sap_out_id, v_warehouse_id
        FROM inventory.sap_out_header
        WHERE sap_number = v_mat.out_sap;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SAP Out dengan nomor % tidak ditemukan.', v_mat.out_sap;
        END IF;

        -- 5. FIFO logic to deduct from sap_out_items
        FOR v_item IN
            SELECT id, qty_req, COALESCE(qty_used, 0) as qty_used
            FROM inventory.sap_out_items
            WHERE header_id = v_sap_out_id AND designator_id = v_material_id
            ORDER BY id ASC
            FOR UPDATE
        LOOP
            IF v_remaining_qty <= 0 THEN
                EXIT;
            END IF;

            IF v_item.qty_req > v_item.qty_used THEN
                v_deduct_qty := LEAST(v_remaining_qty, v_item.qty_req - v_item.qty_used);
                
                UPDATE inventory.sap_out_items
                SET qty_used = COALESCE(qty_used, 0) + v_deduct_qty
                WHERE id = v_item.id;

                v_remaining_qty := v_remaining_qty - v_deduct_qty;
            END IF;
        END LOOP;

        IF v_remaining_qty > 0 THEN
            RAISE EXCEPTION 'QTY Used melebihi sisa QTY Request di SAP Out % untuk material %', v_mat.out_sap, v_mat.designator_id;
        END IF;

        -- 6. Call sp_record_material_used (for audit movement)
        CALL inventory.sp_record_material_used(v_warehouse_id, v_material_id, v_mat.qty::int, LEFT(p_id_trx, 50), p_notes, p_create_by);

        -- 7. Check if auto-close is needed for sap_out_header
        SELECT bool_and(qty_req = COALESCE(qty_used, 0)) INTO v_all_closed
        FROM inventory.sap_out_items
        WHERE header_id = v_sap_out_id;

        IF v_all_closed THEN
            UPDATE inventory.sap_out_header
            SET end_status = 'close'
            WHERE id = v_sap_out_id;
        END IF;
    END LOOP;
END;
$$;

-- Alter tables to ensure create_at is TIMESTAMPTZ
ALTER TABLE inventory.rekon_used_header ALTER COLUMN create_at TYPE TIMESTAMPTZ USING create_at AT TIME ZONE 'UTC';
ALTER TABLE inventory.rekon_used_list ALTER COLUMN create_at TYPE TIMESTAMPTZ USING create_at AT TIME ZONE 'UTC';
