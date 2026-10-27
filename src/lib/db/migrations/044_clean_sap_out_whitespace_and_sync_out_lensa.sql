-- ============================================================================
-- Migration: 044_clean_sap_out_whitespace_and_sync_out_lensa.sql
-- Description:
-- 1. Sanitize trailing whitespace in inventory.sap_out_header (sap_number, request_id, id_reservasi).
-- 2. Update inventory.sp_create_out_sap to TRIM input strings and auto-sync out_lensa_ref_header.sap_out_check.
-- 3. Sync existing inventory.out_lensa_ref_header sap_out_check flag using robust trimmed matching (gi_number or reservation_id).
-- ============================================================================

-- 1. Sanitize existing whitespace in sap_out_header
UPDATE inventory.sap_out_header
SET sap_number   = TRIM(sap_number),
    request_id   = TRIM(request_id),
    id_reservasi = TRIM(id_reservasi)
WHERE sap_number != TRIM(sap_number)
   OR request_id != TRIM(request_id)
   OR id_reservasi != TRIM(id_reservasi);

-- 2. Update sp_create_out_sap
CREATE OR REPLACE PROCEDURE inventory.sp_create_out_sap(
    p_warehouse_id INT,
    p_nik_teknisi VARCHAR,
    p_name_sa VARCHAR,
    p_id_reservasi VARCHAR,
    p_sap_number VARCHAR,
    p_request_id VARCHAR,
    p_created_by VARCHAR,
    p_items JSONB,
    OUT p_header_id BIGINT,
    OUT p_id_trx VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_intls VARCHAR;
    v_yymm VARCHAR;
    v_seq VARCHAR;
    v_item RECORD;
    v_current_stock NUMERIC;
    v_clean_sap_number VARCHAR;
    v_clean_request_id VARCHAR;
    v_clean_id_reservasi VARCHAR;
    v_clean_name_sa VARCHAR;
BEGIN
    -- Trim inputs
    v_clean_sap_number   := TRIM(p_sap_number);
    v_clean_request_id   := TRIM(p_request_id);
    v_clean_id_reservasi := TRIM(p_id_reservasi);
    v_clean_name_sa      := TRIM(p_name_sa);

    -- 1. Validate Warehouse & fetch initials
    SELECT intls INTO v_intls
    FROM inventory.mas_wh
    WHERE id = p_warehouse_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Warehouse id % tidak ditemukan', p_warehouse_id;
    END IF;

    IF v_intls IS NULL OR v_intls = '' THEN
        v_intls := 'UNKNOWN';
    END IF;

    -- 2. Generate YYMM and Sequence
    v_yymm := to_char(CURRENT_TIMESTAMP, 'YYMM');
    SELECT to_char(nextval('inventory.trx_out_seq'), 'FM0000') INTO v_seq;

    -- 3. Construct ID Trx: TRX-OUT-{intls}-{nik_teknisi}-{yymm}{seq}
    p_id_trx := 'TRX-OUT-' || v_intls || '-' || TRIM(p_nik_teknisi) || '-' || v_yymm || v_seq;

    -- 4. Check duplicate id_trx
    IF EXISTS (SELECT 1 FROM inventory.sap_out_header WHERE id_trx = p_id_trx) THEN
        RAISE EXCEPTION 'id_trx % sudah ada di sap_out_header', p_id_trx;
    END IF;

    -- 5. Insert Header
    INSERT INTO inventory.sap_out_header (
        id_trx,
        nik_teknisi,
        name_sa,
        warehouse_id,
        id_reservasi,
        sap_number,
        request_id,
        end_status,
        created_by,
        request_time,
        sap_time
    ) VALUES (
        p_id_trx,
        TRIM(p_nik_teknisi),
        v_clean_name_sa,
        p_warehouse_id,
        v_clean_id_reservasi,
        v_clean_sap_number,
        v_clean_request_id,
        'intech',
        p_created_by,
        NOW(),
        NOW()
    ) RETURNING id INTO p_header_id;

    -- 6. Process and insert items
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN
            SELECT * FROM jsonb_to_recordset(p_items) AS (
                designator_id BIGINT,
                qty_req INT,
                unit_price NUMERIC
            )
        LOOP
            -- Lock stock balance row and validate stock availability
            SELECT qty_stock INTO v_current_stock
            FROM inventory.stock_balance
            WHERE warehouse_id = p_warehouse_id
              AND designator_id = v_item.designator_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Stok tidak ditemukan di warehouse % untuk designator %',
                    p_warehouse_id, v_item.designator_id;
            END IF;

            IF v_current_stock < v_item.qty_req THEN
                RAISE EXCEPTION 'Stok tidak mencukupi untuk material % di warehouse %: tersedia %, diminta %',
                    v_item.designator_id, p_warehouse_id, v_current_stock, v_item.qty_req;
            END IF;

            -- Insert item
            INSERT INTO inventory.sap_out_items (
                header_id,
                designator_id,
                qty_req,
                qty_used,
                unit_price,
                created_at
            ) VALUES (
                p_header_id,
                v_item.designator_id,
                v_item.qty_req,
                0,
                COALESCE(v_item.unit_price, 0),
                NOW()
            );
        END LOOP;
    END IF;

    -- 7. Call sp_sap_out to deduct stock and record stock movement
    CALL inventory.sp_sap_out(p_header_id, p_warehouse_id, p_created_by);

    -- 8. Auto-link and set sap_out_check on matching out_lensa_ref_header
    UPDATE inventory.out_lensa_ref_header
    SET sap_out_check = TRUE
    WHERE (
        (NULLIF(TRIM(gi_number), '') IS NOT NULL AND TRIM(gi_number) = v_clean_sap_number)
        OR
        (NULLIF(TRIM(reservation_id), '') IS NOT NULL AND TRIM(reservation_id) = v_clean_request_id)
    )
    AND (sap_out_check IS FALSE OR sap_out_check IS NULL);
END;
$$;

REVOKE EXECUTE ON PROCEDURE inventory.sp_create_out_sap(INT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, BIGINT, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE inventory.sp_create_out_sap(INT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, BIGINT, VARCHAR) TO imam;

-- 3. Sync existing out_lensa_ref_header sap_out_check
UPDATE inventory.out_lensa_ref_header h
SET sap_out_check = TRUE
FROM inventory.sap_out_header s
WHERE (
    (NULLIF(TRIM(h.gi_number), '') IS NOT NULL AND TRIM(h.gi_number) = TRIM(s.sap_number))
    OR
    (NULLIF(TRIM(h.reservation_id), '') IS NOT NULL AND TRIM(h.reservation_id) = TRIM(s.request_id))
)
AND (h.sap_out_check IS FALSE OR h.sap_out_check IS NULL);
