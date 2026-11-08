-- Migration 033: Match TAG procedure owner variable to the database enum.
-- This prevents assigning VARCHAR values to nte_inventory.enum_owner columns.
BEGIN;

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
        RAISE EXCEPTION 'Transaksi tidak valid: asal dan tujuan keduanya check_sn=false';
    END IF;

    IF jsonb_typeof(p_sn_list) <> 'array' OR jsonb_array_length(p_sn_list) = 0 THEN
        RAISE EXCEPTION 'Daftar SN wajib berupa array yang tidak kosong';
    END IF;

    FOR v_sn_raw IN SELECT jsonb_array_elements(p_sn_list)
    LOOP
        IF jsonb_typeof(v_sn_raw) = 'string' THEN
            v_sn_text := v_sn_raw #>> '{}';
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
                RAISE EXCEPTION 'Format SN harus berupa objek untuk alamat asal check_sn=false';
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
            VALUES (v_sn_text, v_item_desc, 'available', 'normal', v_owner, p_tujuan, NOW(), NOW())
            ON CONFLICT (serial_number) DO NOTHING;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'SN "%" sudah terdaftar; TAG masuk dibatalkan', v_sn_text;
            END IF;
        END IF;

        INSERT INTO nte_inventory.log_transaction_nte
            (id_transaksi, serial_number, type_transaksi, asal, tujuan, create_by)
        VALUES (v_id_transaksi, v_sn_text, 'stock_transfer', p_asal, p_tujuan, p_created_by);
    END LOOP;

    RAISE NOTICE 'NTE TAG WH-WH berhasil: % (asal check_sn=%, tujuan check_sn=%)',
        v_id_transaksi, v_asal_check_sn, v_tujuan_check_sn;
END;
$$;

GRANT EXECUTE ON PROCEDURE nte_inventory.sp_create_tag_nte(
    VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR
) TO imam;

COMMIT;
