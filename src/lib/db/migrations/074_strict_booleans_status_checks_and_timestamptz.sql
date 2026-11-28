-- ============================================================================
-- Migration: 074_strict_booleans_status_checks_and_timestamptz.sql
-- Description:
-- Tahap 1 Audit Kepatuhan Tipe Data Strict:
-- 1. Mengeliminasi 3-valued boolean (NULL) pada kolom flag aktif & check.
-- 2. Menambahkan CHECK constraints pada kolom status/end_status yang masih free-text.
-- 3. Menghapus duplikasi CHECK constraint pada inventory.stock_balance.
-- 4. Mengonversi timestamp without time zone -> timestamptz di etl.data_kpro_clean.
-- ============================================================================

-- 1. Backfill NULLs & Enforce NOT NULL pada kolom Boolean (hilangkan 3-valued logic)
UPDATE inventory.out_lensa_ref_header SET sap_out_check = false WHERE sap_out_check IS NULL;
ALTER TABLE inventory.out_lensa_ref_header ALTER COLUMN sap_out_check SET NOT NULL;

UPDATE inventory.out_lensa_ref_header_archive SET sap_out_check = false WHERE sap_out_check IS NULL;
ALTER TABLE inventory.out_lensa_ref_header_archive ALTER COLUMN sap_out_check SET NOT NULL;

UPDATE inventory.wo_lensa_header SET rekon_check = false WHERE rekon_check IS NULL;
ALTER TABLE inventory.wo_lensa_header ALTER COLUMN rekon_check SET NOT NULL;

UPDATE inventory.wo_lensa_header_archive SET rekon_check = false WHERE rekon_check IS NULL;
ALTER TABLE inventory.wo_lensa_header_archive ALTER COLUMN rekon_check SET NOT NULL;

UPDATE inventory.mas_wh SET check_stock = true WHERE check_stock IS NULL;
ALTER TABLE inventory.mas_wh ALTER COLUMN check_stock SET NOT NULL;

UPDATE auth."user" SET "twoFactorEnabled" = false WHERE "twoFactorEnabled" IS NULL;
ALTER TABLE auth."user" ALTER COLUMN "twoFactorEnabled" SET NOT NULL;

UPDATE auth."twoFactor" SET verified = true WHERE verified IS NULL;
ALTER TABLE auth."twoFactor" ALTER COLUMN verified SET NOT NULL;

UPDATE nte_inventory.mas_address_nte SET check_sn = true WHERE check_sn IS NULL;
ALTER TABLE nte_inventory.mas_address_nte ALTER COLUMN check_sn SET NOT NULL;

UPDATE nte_inventory.mas_address_nte SET is_active = true WHERE is_active IS NULL;
ALTER TABLE nte_inventory.mas_address_nte ALTER COLUMN is_active SET NOT NULL;

UPDATE nte_inventory.mas_item_nte SET is_active = true WHERE is_active IS NULL;
ALTER TABLE nte_inventory.mas_item_nte ALTER COLUMN is_active SET NOT NULL;

-- 2. Enforce CHECK constraints pada kolom status yang masih free-text (idempoten)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sap_out_header_end_status') THEN
        ALTER TABLE inventory.sap_out_header
            ADD CONSTRAINT chk_sap_out_header_end_status
            CHECK (end_status IN ('intech', 'close'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_material_header_end_status') THEN
        ALTER TABLE inventory.return_material_header
            ADD CONSTRAINT chk_return_material_header_end_status
            CHECK (end_status IN ('pending', 'wait_approve', 'requested', 'accepted', 'cancel', 'rejected'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_stock_policy_log_status') THEN
        ALTER TABLE inventory.stock_policy_log
            ADD CONSTRAINT chk_stock_policy_log_status
            CHECK (status IN ('success', 'failed', 'error'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_etl_import_jobs_status') THEN
        ALTER TABLE etl.import_jobs
            ADD CONSTRAINT chk_etl_import_jobs_status
            CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_etl_stg_out_lensa_status') THEN
        ALTER TABLE etl.stg_out_lensa_raw
            ADD CONSTRAINT chk_etl_stg_out_lensa_status
            CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_etl_stg_wo_lensa_status') THEN
        ALTER TABLE etl.stg_wo_lensa_raw
            ADD CONSTRAINT chk_etl_stg_wo_lensa_status
            CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'));
    END IF;
END $$;

-- Pastikan sap_out_header.end_status tidak bernilai NULL
UPDATE inventory.sap_out_header SET end_status = 'intech' WHERE end_status IS NULL;
ALTER TABLE inventory.sap_out_header ALTER COLUMN end_status SET NOT NULL;

-- 3. Hapus duplikasi CHECK constraint pada inventory.stock_balance
ALTER TABLE inventory.stock_balance DROP CONSTRAINT IF EXISTS stock_balance_qty_stock_check;

-- 4. Konversi timestamp without time zone -> timestamptz di etl.data_kpro_clean
ALTER TABLE etl.data_kpro_clean
    ALTER COLUMN actstart TYPE timestamptz USING actstart AT TIME ZONE 'Asia/Jakarta',
    ALTER COLUMN datecreated TYPE timestamptz USING datecreated AT TIME ZONE 'Asia/Jakarta',
    ALTER COLUMN schedule_labor TYPE timestamptz USING schedule_labor AT TIME ZONE 'Asia/Jakarta',
    ALTER COLUMN statusdate TYPE timestamptz USING statusdate AT TIME ZONE 'Asia/Jakarta',
    ALTER COLUMN tanggal_approval TYPE timestamptz USING tanggal_approval AT TIME ZONE 'Asia/Jakarta',
    ALTER COLUMN tgl_manja TYPE timestamptz USING tgl_manja AT TIME ZONE 'Asia/Jakarta';
