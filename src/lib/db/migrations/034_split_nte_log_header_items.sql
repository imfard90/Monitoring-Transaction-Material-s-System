-- Migration 034: Split NTE log into header+items, add status workflow
-- TRUNCATE existing log and mas_sn_nte data (development cleanup)
BEGIN;

-- 1. Create new header table
CREATE TABLE IF NOT EXISTS nte_inventory.log_transaction_header (
    id_transaksi VARCHAR PRIMARY KEY,
    type_transaksi VARCHAR NOT NULL,
    asal VARCHAR NOT NULL REFERENCES nte_inventory.mas_address_nte(address_name),
    tujuan VARCHAR NOT NULL REFERENCES nte_inventory.mas_address_nte(address_name),
    status VARCHAR NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'request', 'approve', 'cancel')),
    created_by VARCHAR NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_log_header_status ON nte_inventory.log_transaction_header(status);
CREATE INDEX IF NOT EXISTS idx_log_header_created_at ON nte_inventory.log_transaction_header(created_at);
CREATE INDEX IF NOT EXISTS idx_log_header_asal ON nte_inventory.log_transaction_header(asal);
CREATE INDEX IF NOT EXISTS idx_log_header_tujuan ON nte_inventory.log_transaction_header(tujuan);

-- 2. Create new items table
CREATE TABLE IF NOT EXISTS nte_inventory.log_transaction_items (
    id BIGSERIAL PRIMARY KEY,
    id_transaksi VARCHAR NOT NULL REFERENCES nte_inventory.log_transaction_header(id_transaksi) ON DELETE CASCADE,
    serial_number VARCHAR NOT NULL,
    item_description VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_items_id_transaksi ON nte_inventory.log_transaction_items(id_transaksi);
CREATE INDEX IF NOT EXISTS idx_log_items_sn ON nte_inventory.log_transaction_items(serial_number);

-- 3. Truncate existing data (development cleanup)
TRUNCATE TABLE nte_inventory.log_transaction_nte CASCADE;
TRUNCATE TABLE nte_inventory.mas_sn_nte CASCADE;

-- 4. Rename old log table as backup
ALTER TABLE nte_inventory.log_transaction_nte RENAME TO log_transaction_nte_backup;

-- 5. Update sp_create_tag_nte to use new tables
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
        RAISE EXCEPTION 'Daftar SN tidak boleh kosong';
    END IF;

    -- Insert header once with status=approve (TAG is auto-approved)
    INSERT INTO nte_inventory.log_transaction_header
        (id_transaksi, type_transaksi, asal, tujuan, status, created_by, created_at, updated_at)
    VALUES
        (v_id_transaksi, 'stock_transfer', p_asal, p_tujuan, 'approve', p_created_by, NOW(), NOW());

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

        IF v_asal_check_sn THEN
            IF jsonb_typeof(v_sn_raw) <> 'string' THEN
                RAISE EXCEPTION 'Format SN harus berupa string untuk alamat asal check_sn=true';
            END IF;

            UPDATE nte_inventory.mas_sn_nte
            SET address = p_tujuan, updated_at = NOW()
            WHERE serial_number = v_sn_text
              AND inventory_status = 'available'
              AND condition_status <> 'damage'
              AND address = p_asal
            RETURNING owner INTO v_owner;

            IF NOT FOUND THEN
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

            SELECT owner INTO v_owner
            FROM nte_inventory.mas_address_nte WHERE address_name = p_tujuan;

            INSERT INTO nte_inventory.mas_sn_nte
                (serial_number, item_description, inventory_status, condition_status, owner, address, created_at, updated_at)
            VALUES
                (v_sn_text, v_item_desc, 'available', 'normal', v_owner, p_tujuan, NOW(), NOW())
            ON CONFLICT (serial_number) DO NOTHING;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'SN "%" sudah terdaftar; TAG masuk dibatalkan', v_sn_text;
            END IF;
        END IF;

        -- Insert item into new log_transaction_items table
        INSERT INTO nte_inventory.log_transaction_items
            (id_transaksi, serial_number, item_description, created_at)
        VALUES
            (v_id_transaksi, v_sn_text, v_item_desc, NOW());
    END LOOP;

    RAISE NOTICE 'NTE TAG WH-WH berhasil: % (asal check_sn=%, tujuan check_sn=%)',
        v_id_transaksi, v_asal_check_sn, v_tujuan_check_sn;
END;
$$;

GRANT EXECUTE ON PROCEDURE nte_inventory.sp_create_tag_nte(
    VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR
) TO imam;

COMMIT;
