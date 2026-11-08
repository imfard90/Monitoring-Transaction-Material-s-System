-- Migration: 026_create_nte_inventory_schema.sql
-- NTE (Network Terminal Equipment) inventory schema
-- Scope: ONT, SetTopBox per Serial Number management
-- Rebuild only the new nte_inventory schema; legacy schema nte is preserved.

BEGIN;

-- This migration only creates the new nte_inventory schema; legacy nte is preserved.
CREATE SCHEMA IF NOT EXISTS nte_inventory;

-- ============================================================
-- SCHEMA
-- ============================================================

-- ============================================================
-- SEQUENCE for transaction ID
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS nte_inventory.trx_nte_seq;

-- ============================================================
-- TABLE: mas_item_nte (master item / model)
-- ============================================================
CREATE TABLE IF NOT EXISTS nte_inventory.mas_item_nte (
    id              BIGSERIAL PRIMARY KEY,
    type            VARCHAR(20) NOT NULL,        -- ONT, STB
    merek           VARCHAR(30) NOT NULL,         -- HUAWEI, ZTE, dll
    type_sn         VARCHAR(50) NOT NULL,         -- HG8245H5, ZXV10B860HV5
    item_description VARCHAR(100) NOT NULL,       -- ONT;HUAWEI_HG8245H5
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(type, merek, type_sn)
);

COMMENT ON TABLE nte_inventory.mas_item_nte IS 'Master model NTE (ONT, SetTopBox)';

-- ============================================================
-- TABLE: mas_address_nte (master address / lokasi)
-- ============================================================
DO $$ BEGIN
    CREATE TYPE nte_inventory.enum_owner AS ENUM ('telkom', 'tif', 'tsel');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE nte_inventory.enum_location_type AS ENUM ('warehouse', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS nte_inventory.mas_address_nte (
    address_name    VARCHAR(50) PRIMARY KEY,
    owner           nte_inventory.enum_owner NOT NULL,
    location_type   nte_inventory.enum_location_type NOT NULL DEFAULT 'warehouse',
    ui_label        VARCHAR(50) NOT NULL,         -- nama tampil di UI
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE nte_inventory.mas_address_nte IS 'Master lokasi/address NTE';

-- ============================================================
-- TABLE: mas_sn_nte (inventory SN)
-- ============================================================
DO $$ BEGIN
    CREATE TYPE nte_inventory.enum_inventory_status AS ENUM ('available', 'unavailable', 'installed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE TYPE nte_inventory.enum_condition_status AS ENUM ('normal', 'damage', 'refurbish');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS nte_inventory.mas_sn_nte (
    id                  BIGSERIAL PRIMARY KEY,
    serial_number       VARCHAR(100) UNIQUE NOT NULL,
    item_description    VARCHAR(100) NOT NULL,     -- fk ke mas_item_nte.item_description
    owner               nte_inventory.enum_owner NOT NULL,
    address             VARCHAR(50) REFERENCES nte_inventory.mas_address_nte(address_name),
    inventory_status    nte_inventory.enum_inventory_status DEFAULT 'available',
    condition_status    nte_inventory.enum_condition_status DEFAULT 'normal',
    wo_number           VARCHAR(50),
    inet_number         VARCHAR(50),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE nte_inventory.mas_sn_nte IS 'Inventory per Serial Number NTE';

-- ============================================================
-- TABLE: log_transaction_nte (transaction log)
-- ============================================================
DO $$ BEGIN
    CREATE TYPE nte_inventory.enum_type_transaksi AS ENUM (
        'stock_transfer',
        'send_to_technician',
        'installation',
        'return_from_technician'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS nte_inventory.log_transaction_nte (
    id                  BIGSERIAL PRIMARY KEY,
    id_transaksi        VARCHAR(100) NOT NULL,
    serial_number       VARCHAR(100) NOT NULL,
    type_transaksi      nte_inventory.enum_type_transaksi NOT NULL,
    asal                VARCHAR(50),
    tujuan              VARCHAR(50),
    create_at           TIMESTAMPTZ DEFAULT NOW(),
    create_by           VARCHAR(50)
);

COMMENT ON TABLE nte_inventory.log_transaction_nte IS 'Log history transaksi NTE per SN';

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sn_nte_serial ON nte_inventory.mas_sn_nte(serial_number);
CREATE INDEX IF NOT EXISTS idx_sn_nte_status ON nte_inventory.mas_sn_nte(inventory_status);
CREATE INDEX IF NOT EXISTS idx_sn_nte_address ON nte_inventory.mas_sn_nte(address);
CREATE INDEX IF NOT EXISTS idx_sn_nte_item ON nte_inventory.mas_sn_nte(item_description);
CREATE INDEX IF NOT EXISTS idx_sn_nte_owner ON nte_inventory.mas_sn_nte(owner);

CREATE INDEX IF NOT EXISTS idx_log_trx_id ON nte_inventory.log_transaction_nte(id_transaksi);
CREATE INDEX IF NOT EXISTS idx_log_trx_sn ON nte_inventory.log_transaction_nte(serial_number);
CREATE INDEX IF NOT EXISTS idx_log_trx_date ON nte_inventory.log_transaction_nte(create_at);
CREATE INDEX IF NOT EXISTS idx_log_trx_type ON nte_inventory.log_transaction_nte(type_transaksi);

-- ============================================================
-- SEED: mas_address_nte (18 locations)
-- ============================================================
INSERT INTO nte_inventory.mas_address_nte (address_name, owner, location_type, ui_label)
VALUES
    -- TELKOM
    ('ta_witel_ccan_sby_utara',      'telkom', 'warehouse', 'Witel SBY Utara'),
    ('ta_so_ccan_bambe_wh',          'telkom', 'warehouse', 'Karangpilang'),
    ('ta_so_ccan_gresik_wh',         'telkom', 'warehouse', 'SO CCAN Gresik'),
    ('ta_so_ccan_lamongan_wh',       'telkom', 'warehouse', 'SO CCAN Lamongan'),
    ('ta_so_ccan_bojonegoro_wh',    'telkom', 'warehouse', 'SO CCAN Bojonegoro'),
    ('ta_so_ccan_tuban_wh',          'telkom', 'warehouse', 'SO CCAN Tuban'),
    -- TIF
    ('tif_district_lamongan_wh',     'tif',    'warehouse', 'TIF District Lamongan'),
    ('tif_so_bambe_wh',              'tif',    'warehouse', 'TIF SO Karangpilang'),
    ('tif_so_gresik_wh',             'tif',    'warehouse', 'TIF SO Gresik'),
    ('tif_so_lamongan_wh',           'tif',    'warehouse', 'TIF SO Lamongan'),
    ('tif_so_bojonegoro_wh',         'tif',    'warehouse', 'TIF SO Bojonegoro'),
    ('tif_so_tuban_wh',              'tif',    'warehouse', 'TIF SO Tuban'),
    -- Tsel
    ('ta_witel_inv_sby_utara',       'tsel',   'warehouse', 'Tsel Witel SBY Utara'),
    ('ta_so_inv_bambe_wh',           'tsel',   'warehouse', 'Tsel Inv Karangpilang'),
    ('ta_so_inv_gresik_wh',          'tsel',   'warehouse', 'Tsel Inv Gresik'),
    ('ta_so_inv_lamongan_wh',        'tsel',   'warehouse', 'Tsel Inv Lamongan'),
    ('ta_so_inv_bojonegoro_wh',      'tsel',   'warehouse', 'Tsel Inv Bojonegoro'),
    ('ta_so_inv_tuban_wh',           'tsel',   'warehouse', 'Tsel Inv Tuban')
ON CONFLICT (address_name) DO NOTHING;

-- ============================================================
-- SEED: mas_item_nte (sample items)
-- ============================================================
INSERT INTO nte_inventory.mas_item_nte (type, merek, type_sn, item_description)
VALUES
    ('ONT', 'HUAWEI', 'HG8245H5', 'ONT;HUAWEI_HG8245H5'),
    ('ONT', 'HUAWEI', 'HG8245H',  'ONT;HUAWEI_HG8245H'),
    ('ONT', 'ZTE',    'ZXV10B860HV5', 'ONT;ZTE_ZXV10B860HV5'),
    ('ONT', 'ZTE',    'F670L',    'ONT;ZTE_F670L'),
    ('STB', 'ZTE',    'ZXV10B860HV5', 'STB;ZTE_ZXV10B860HV5'),
    ('STB', 'ZTE',    'ZXV10B860H',  'STB;ZTE_ZXV10B860H'),
    ('STB', 'INDIBOX', 'IBOX3',   'STB;INDIBOX_IBOX3'),
    ('STB', 'LUMEN',  'LMN-HD',   'STB;LUMEN_LMN-HD')
ON CONFLICT (type, merek, type_sn) DO NOTHING;

-- ============================================================
-- GRANT
-- ============================================================
REVOKE ALL ON SCHEMA nte_inventory FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA nte_inventory FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA nte_inventory FROM PUBLIC;
GRANT USAGE ON SCHEMA nte_inventory TO imam;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nte_inventory TO imam;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA nte_inventory TO imam;

-- ============================================================
-- LOG
-- ============================================================
-- The migration runner records this file in inventory._migration_log.

COMMIT;
