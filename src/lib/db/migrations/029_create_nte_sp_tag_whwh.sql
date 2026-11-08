-- Migration: 029_create_nte_sp_tag_whwh.sql
-- NTE TAG WH-WH: Inter-SO, Dari-SO, Ke-SO sub-types
-- bispro-nte.md §4.1 + §7.2
-- Non-prod DB

BEGIN;

-- ============================================================
-- DROP old overloads (migration 027 had 5-param version, previous 029 had 4-param)
-- ============================================================
DROP PROCEDURE IF EXISTS nte_inventory.sp_create_tag_nte(
    VARCHAR, VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR
);
DROP PROCEDURE IF EXISTS nte_inventory.sp_create_tag_nte(
    VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR
);

-- ============================================================
-- PROCEDURE: sp_create_tag_nte
-- TAG WH-WH: 3 subtype detection based on address prefix
-- Supports p_sn_list as:
--   - string[] for Inter-SO / Dari-SO  : ["SN001", "SN002"]
--   - object[] for Ke-SO              : [{serial_number:"...", item_description:"..."}]
-- ============================================================
CREATE OR REPLACE PROCEDURE nte_inventory.sp_create_tag_nte(
    p_asal           VARCHAR,
    p_tujuan         VARCHAR,
    p_sn_list        JSONB,
    p_created_by     VARCHAR,
    OUT p_id_trx     VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_sn_record      RECORD;
    v_id_transaksi   VARCHAR;
    v_is_asal_so     BOOLEAN;
    v_is_tujuan_so   BOOLEAN;
    v_sn_text        VARCHAR;
    v_owner          VARCHAR;
    v_item_desc      VARCHAR;
    v_sn_raw         JSONB;
BEGIN
    -- 1. Generate id_transaksi
    v_id_transaksi := 'WH-WH_' || p_asal || '_' || p_tujuan || '_'
        || to_char(CURRENT_DATE, 'YYYYMMDD')
        || lpad(nextval('nte_inventory.trx_nte_seq')::text, 5, '0');
    p_id_trx := v_id_transaksi;

    -- 2. Classify: SO = owner='telkom' AND (prefix 'ta_so_*' OR address='ta_witel_ccan_sby_utara')
    v_is_asal_so := EXISTS (
        SELECT 1 FROM nte_inventory.mas_address_nte addr
        WHERE addr.address_name = p_asal
          AND addr.owner = 'telkom'
          AND (addr.address_name LIKE 'ta_so_%' OR addr.address_name = 'ta_witel_ccan_sby_utara')
    );

    v_is_tujuan_so := EXISTS (
        SELECT 1 FROM nte_inventory.mas_address_nte addr
        WHERE addr.address_name = p_tujuan
          AND addr.owner = 'telkom'
          AND (addr.address_name LIKE 'ta_so_%' OR addr.address_name = 'ta_witel_ccan_sby_utara')
    );

    -- 3. Process each SN
    -- Handle both string[] and object[] formats
    FOR v_sn_raw IN SELECT jsonb_array_elements(p_sn_list) LOOP
        -- Detect format: string vs object
        IF jsonb_typeof(v_sn_raw) = 'string' THEN
            -- Flat string format: ["SN001", "SN002"]
            v_sn_text   := v_sn_raw #>> '{}';
            v_item_desc := NULL;
        ELSE
            -- Object format: [{serial_number:"...", item_description:"..."}]
            v_sn_text   := v_sn_raw->>'serial_number';
            v_item_desc := v_sn_raw->>'item_description';
        END IF;

        -- === Inter-SO: SO → SO ===
        IF v_is_asal_so AND v_is_tujuan_so THEN
            UPDATE nte_inventory.mas_sn_nte
            SET address = p_tujuan, updated_at = NOW()
            WHERE serial_number = v_sn_text
              AND inventory_status = 'available'
              AND condition_status != 'damage'
              AND address = p_asal
            RETURNING owner INTO v_owner;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'SN "%" tidak ditemukan atau tidak valid di %', v_sn_text, p_asal;
            END IF;
            INSERT INTO nte_inventory.log_transaction_nte
                (id_transaksi, serial_number, type_transaksi, asal, tujuan, create_by)
            VALUES (v_id_transaksi, v_sn_text, 'stock_transfer', p_asal, p_tujuan, p_created_by);

        -- === Dari-SO: SO → NONSO ===
        ELSIF v_is_asal_so AND NOT v_is_tujuan_so THEN
            IF NOT EXISTS (
                SELECT 1 FROM nte_inventory.mas_sn_nte
                WHERE serial_number = v_sn_text
                  AND inventory_status = 'available'
                  AND condition_status != 'damage'
                  AND address = p_asal
            ) THEN
                RAISE EXCEPTION 'SN "%" tidak ditemukan atau tidak valid di %', v_sn_text, p_asal;
            END IF;
            -- Address TIDAK berubah, hanya log TAG keluar
            INSERT INTO nte_inventory.log_transaction_nte
                (id_transaksi, serial_number, type_transaksi, asal, tujuan, create_by)
            VALUES (v_id_transaksi, v_sn_text, 'stock_transfer', p_asal, p_tujuan, p_created_by);

        -- === Ke-SO: NONSO → SO ===
        ELSE
            -- item_description wajib ada untuk INSERT
            IF v_item_desc IS NULL OR v_item_desc = '' THEN
                RAISE EXCEPTION 'item_description wajib untuk TAG masuk ke SO: SN "%"', v_sn_text;
            END IF;
            INSERT INTO nte_inventory.mas_sn_nte
                (serial_number, item_description, owner, address, inventory_status, condition_status)
            VALUES (
                v_sn_text,
                v_item_desc,
                (SELECT owner FROM nte_inventory.mas_address_nte WHERE address_name = p_tujuan),
                p_tujuan,
                'available',
                'normal'
            )
            ON CONFLICT (serial_number) DO UPDATE SET
                address    = p_tujuan,
                updated_at = NOW();
            INSERT INTO nte_inventory.log_transaction_nte
                (id_transaksi, serial_number, type_transaksi, asal, tujuan, create_by)
            VALUES (v_id_transaksi, v_sn_text, 'stock_transfer', p_asal, p_tujuan, p_created_by);
        END IF;
    END LOOP;

    RAISE NOTICE 'NTE tag WH-WH created: %', v_id_transaksi;
END;
$$;

-- ============================================================
-- GRANT
-- ============================================================
GRANT EXECUTE ON PROCEDURE nte_inventory.sp_create_tag_nte(
    VARCHAR, VARCHAR, JSONB, VARCHAR, OUT VARCHAR
) TO imam;

COMMIT;
