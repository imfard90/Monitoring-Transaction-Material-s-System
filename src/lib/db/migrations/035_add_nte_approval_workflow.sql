-- Migration 035: Add NTE TAG approval workflow with warehouse authorization
-- ADR-002 NTE-06: Stored procedure authorization contract
-- ADR-002 NTE-09: Warehouse mapping validation

BEGIN;

-- ============================================================
-- 1. Fix sp_create_tag_nte: Change default status to 'request'
-- ============================================================
CREATE OR REPLACE PROCEDURE nte_inventory.sp_create_tag_nte(
    p_asal VARCHAR,
    p_tujuan VARCHAR,
    p_sn_list JSONB,
    p_created_by VARCHAR,
    OUT p_id_trx VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_sn_raw JSONB;
    v_sn_text VARCHAR;
    v_asal_check_sn BOOLEAN;
    v_tujuan_check_sn BOOLEAN;
    v_item_desc VARCHAR;
    v_owner nte_inventory.enum_owner;
    v_id_transaksi VARCHAR;
    v_seen_serial_numbers TEXT[] := ARRAY[]::TEXT[];
BEGIN
    v_id_transaksi := 'TAG-WH-WH_' || p_asal || '-' || p_tujuan || '-' ||
                      to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                      lpad(nextval('nte_inventory.trx_nte_seq')::text, 5, '0');
    p_id_trx := v_id_transaksi;

    SELECT check_sn INTO v_asal_check_sn
    FROM nte_inventory.mas_address_nte WHERE address_name = p_asal;
    IF v_asal_check_sn IS NULL THEN
        RAISE EXCEPTION 'Address asal "%" tidak ditemukan di mas_address_nte', p_asal;
    END IF;

    SELECT check_sn INTO v_tujuan_check_sn
    FROM nte_inventory.mas_address_nte WHERE address_name = p_tujuan;
    IF v_tujuan_check_sn IS NULL THEN
        RAISE EXCEPTION 'Address tujuan "%" tidak ditemukan di mas_address_nte', p_tujuan;
    END IF;

    IF NOT v_asal_check_sn AND NOT v_tujuan_check_sn THEN
        RAISE EXCEPTION 'Minimal salah satu address harus check_sn=true';
    END IF;

    IF jsonb_array_length(p_sn_list) IS NULL OR jsonb_array_length(p_sn_list) = 0 THEN
        RAISE EXCEPTION 'SN list tidak boleh kosong';
    END IF;

    -- CHANGED: status='request' (not 'approve')
    -- Stock mutation deferred until sp_approve_nte_tag
    INSERT INTO nte_inventory.log_transaction_header
        (id_transaksi, type_transaksi, asal, tujuan, status, created_by, created_at, updated_at)
    VALUES
        (v_id_transaksi, 'stock_transfer', p_asal, p_tujuan, 'request', p_created_by, NOW(), NOW());

    FOR v_sn_raw IN SELECT * FROM jsonb_array_elements(p_sn_list)
    LOOP
        IF jsonb_typeof(v_sn_raw) = 'string' THEN
            v_sn_text := v_sn_raw#>>'{}';
            v_item_desc := NULL;
        ELSIF jsonb_typeof(v_sn_raw) = 'object' THEN
            v_sn_text := v_sn_raw->>'serial_number';
            v_item_desc := v_sn_raw->>'item_description';
        ELSE
            RAISE EXCEPTION 'Format SN tidak valid';
        END IF;

        IF v_sn_text IS NULL OR btrim(v_sn_text) = '' THEN
            RAISE EXCEPTION 'Serial number tidak boleh kosong';
        END IF;
        IF v_sn_text = ANY(v_seen_serial_numbers) THEN
            RAISE EXCEPTION 'Serial number "%" duplikat dalam payload', v_sn_text;
        END IF;
        v_seen_serial_numbers := array_append(v_seen_serial_numbers, v_sn_text);

        -- Validation only, no stock mutation yet
        IF v_asal_check_sn THEN
            IF jsonb_typeof(v_sn_raw) <> 'string' THEN
                RAISE EXCEPTION 'Format SN harus berupa string untuk alamat asal check_sn=true';
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM nte_inventory.mas_sn_nte
                WHERE serial_number = v_sn_text
                  AND inventory_status = 'available'
                  AND condition_status <> 'damage'
                  AND address = p_asal
            ) THEN
                RAISE EXCEPTION 'SN "%" tidak ditemukan atau tidak valid di WH asal "%"', v_sn_text, p_asal;
            END IF;
        ELSE
            IF jsonb_typeof(v_sn_raw) <> 'object' THEN
                RAISE EXCEPTION 'Format SN harus berupa object dengan item_description untuk alamat asal check_sn=false';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM nte_inventory.mas_item_nte
                WHERE item_description = v_item_desc AND is_active = true
            ) THEN
                RAISE EXCEPTION 'item_description "%" tidak ditemukan atau tidak aktif', v_item_desc;
            END IF;
        END IF;

        INSERT INTO nte_inventory.log_transaction_items
            (id_transaksi, serial_number, item_description, created_at)
        VALUES
            (v_id_transaksi, v_sn_text, v_item_desc, NOW());
    END LOOP;

    RAISE NOTICE 'NTE TAG WH-WH request created: % (status=request, awaiting approval)', v_id_transaksi;
END;
$$;

GRANT EXECUTE ON PROCEDURE nte_inventory.sp_create_tag_nte(
    VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR
) TO imam;

-- ============================================================
-- 2. sp_approve_nte_tag: Approve TAG with warehouse authorization
-- ============================================================
CREATE OR REPLACE PROCEDURE nte_inventory.sp_approve_nte_tag(
    p_id_transaksi VARCHAR,
    p_approved_by VARCHAR,
    p_warehouse_id INTEGER  -- NULL for non-Staff, warehouse ID for Staff
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec RECORD;
    v_item RECORD;
    v_asal_check_sn BOOLEAN;
    v_tujuan_check_sn BOOLEAN;
    v_tujuan_wh_id INTEGER;
    v_owner nte_inventory.enum_owner;
BEGIN
    -- 1. Lock header row
    SELECT * INTO v_rec
    FROM nte_inventory.log_transaction_header
    WHERE id_transaksi = p_id_transaksi
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi "%" tidak ditemukan', p_id_transaksi;
    END IF;

    IF v_rec.status <> 'request' THEN
        RAISE EXCEPTION 'Transaksi "%" sudah diproses (status=%)', p_id_transaksi, v_rec.status;
    END IF;

    -- 2. Warehouse authorization: Staff must have warehouse_id matching tujuan
    SELECT mapping_mas_wh INTO v_tujuan_wh_id
    FROM nte_inventory.mas_address_nte
    WHERE address_name = v_rec.tujuan;

    IF v_tujuan_wh_id IS NULL THEN
        RAISE EXCEPTION 'Address tujuan "%" tidak ter-map ke warehouse MTMS', v_rec.tujuan;
    END IF;

    -- Staff authorization: p_warehouse_id must match destination warehouse
    IF p_warehouse_id IS NOT NULL AND p_warehouse_id <> v_tujuan_wh_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff hanya bisa approve TAG untuk warehouse_id=%', p_warehouse_id;
    END IF;

    -- 3. Get check_sn flags
    SELECT check_sn INTO v_asal_check_sn
    FROM nte_inventory.mas_address_nte WHERE address_name = v_rec.asal;

    SELECT check_sn INTO v_tujuan_check_sn
    FROM nte_inventory.mas_address_nte WHERE address_name = v_rec.tujuan;

    -- 4. Execute stock mutation for each item
    FOR v_item IN
        SELECT serial_number, item_description
        FROM nte_inventory.log_transaction_items
        WHERE id_transaksi = p_id_transaksi
    LOOP
        IF v_asal_check_sn THEN
            -- Update existing SN address
            UPDATE nte_inventory.mas_sn_nte
            SET address = v_rec.tujuan, updated_at = NOW()
            WHERE serial_number = v_item.serial_number
              AND inventory_status = 'available'
              AND condition_status <> 'damage'
              AND address = v_rec.asal;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'SN "%" tidak valid di approval (sudah dipindahkan/damaged)', v_item.serial_number;
            END IF;
        ELSE
            -- Insert new SN
            SELECT owner INTO v_owner
            FROM nte_inventory.mas_address_nte WHERE address_name = v_rec.tujuan;

            INSERT INTO nte_inventory.mas_sn_nte
                (serial_number, item_description, inventory_status, condition_status, owner, address, created_at, updated_at)
            VALUES
                (v_item.serial_number, v_item.item_description, 'available', 'normal', v_owner, v_rec.tujuan, NOW(), NOW())
            ON CONFLICT (serial_number) DO NOTHING;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'SN "%" sudah terdaftar saat approval', v_item.serial_number;
            END IF;
        END IF;
    END LOOP;

    -- 5. Update header status
    UPDATE nte_inventory.log_transaction_header
    SET status = 'approve', updated_at = NOW()
    WHERE id_transaksi = p_id_transaksi;

    RAISE NOTICE 'NTE TAG approved: % by %', p_id_transaksi, p_approved_by;
END;
$$;

GRANT EXECUTE ON PROCEDURE nte_inventory.sp_approve_nte_tag(VARCHAR, VARCHAR, INTEGER) TO imam;

-- ============================================================
-- 3. sp_reject_nte_tag: Reject TAG (no stock mutation)
-- ============================================================
CREATE OR REPLACE PROCEDURE nte_inventory.sp_reject_nte_tag(
    p_id_transaksi VARCHAR,
    p_rejected_by VARCHAR,
    p_warehouse_id INTEGER,
    p_notes TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec RECORD;
    v_tujuan_wh_id INTEGER;
BEGIN
    SELECT * INTO v_rec
    FROM nte_inventory.log_transaction_header
    WHERE id_transaksi = p_id_transaksi
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaksi "%" tidak ditemukan', p_id_transaksi;
    END IF;

    IF v_rec.status <> 'request' THEN
        RAISE EXCEPTION 'Transaksi "%" sudah diproses (status=%)', p_id_transaksi, v_rec.status;
    END IF;

    SELECT mapping_mas_wh INTO v_tujuan_wh_id
    FROM nte_inventory.mas_address_nte
    WHERE address_name = v_rec.tujuan;

    IF v_tujuan_wh_id IS NULL THEN
        RAISE EXCEPTION 'Address tujuan "%" tidak ter-map ke warehouse MTMS', v_rec.tujuan;
    END IF;

    IF p_warehouse_id IS NOT NULL AND p_warehouse_id <> v_tujuan_wh_id THEN
        RAISE EXCEPTION 'Unauthorized: Staff hanya bisa reject TAG untuk warehouse_id=%', p_warehouse_id;
    END IF;

    UPDATE nte_inventory.log_transaction_header
    SET status = 'cancel', updated_at = NOW(), notes = COALESCE(p_notes, notes)
    WHERE id_transaksi = p_id_transaksi;

    RAISE NOTICE 'NTE TAG rejected: % by %', p_id_transaksi, p_rejected_by;
END;
$$;

GRANT EXECUTE ON PROCEDURE nte_inventory.sp_reject_nte_tag(VARCHAR, VARCHAR, INTEGER, TEXT) TO imam;

COMMENT ON PROCEDURE nte_inventory.sp_approve_nte_tag IS 'Approve NTE TAG request with warehouse authorization (Staff: warehouse_id must match destination; Non-Staff: warehouse_id=NULL)';
COMMENT ON PROCEDURE nte_inventory.sp_reject_nte_tag IS 'Reject NTE TAG request with warehouse authorization';

COMMIT;
