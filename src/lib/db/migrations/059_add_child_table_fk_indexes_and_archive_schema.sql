-- ============================================================================
-- Migration: 059_add_child_table_fk_indexes_and_archive_schema.sql
-- Description:
--   1. Add B-Tree indexes on missing Foreign Keys in child tables (wo_lensa_list,
--      out_lensa_ref_list, sap_out_items, inout_tag_items, return_material_items, etc.)
--      to eliminate Sequential Scans on JOIN and WHERE header_id IN (...) queries.
--   2. Create archive tables for historical cold data storage (wo_lensa_header_archive,
--      wo_lensa_list_archive, out_lensa_ref_header_archive, out_lensa_ref_list_archive).
--   3. Create stored procedure inventory.sp_archive_old_inventory_records to safely
--      archive reconciled records older than N months and prune transient logs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Missing Foreign Key B-Tree Indexes
-- ----------------------------------------------------------------------------

-- 1.1 wo_lensa_list -> wo_lensa_header
CREATE INDEX IF NOT EXISTS idx_wo_lensa_list_header_id
    ON inventory.wo_lensa_list (header_id);

-- 1.2 out_lensa_ref_list -> out_lensa_ref_header
CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_list_header_id
    ON inventory.out_lensa_ref_list (header_id);

-- 1.3 sap_out_items -> sap_out_header
CREATE INDEX IF NOT EXISTS idx_sap_out_items_header_id
    ON inventory.sap_out_items (header_id);

-- 1.4 inout_tag_items -> inout_tag_header
CREATE INDEX IF NOT EXISTS idx_inout_tag_items_header_id
    ON inventory.inout_tag_items (header_id);

-- 1.5 return_material_items -> return_material_header & sap_out_items
CREATE INDEX IF NOT EXISTS idx_return_material_items_header_id
    ON inventory.return_material_items (header_id);

CREATE INDEX IF NOT EXISTS idx_return_material_items_sap_out_item_id
    ON inventory.return_material_items (sap_out_item_id);

-- 1.6 return_material_header -> sap_out_header
CREATE INDEX IF NOT EXISTS idx_return_material_header_sap_out_id
    ON inventory.return_material_header (sap_out_id);

-- 1.7 transaction_used_item -> transaction_used_header
CREATE INDEX IF NOT EXISTS idx_transaction_used_item_used_id
    ON inventory.transaction_used_item (used_id);

-- 1.8 rekon_used_list -> materials
CREATE INDEX IF NOT EXISTS idx_rekon_used_list_designator_id
    ON inventory.rekon_used_list (designator_id);

-- 1.9 sap_out_header & transaction_used_header -> technicians
CREATE INDEX IF NOT EXISTS idx_sap_out_header_nik_teknisi
    ON inventory.sap_out_header (nik_teknisi);

CREATE INDEX IF NOT EXISTS idx_transaction_used_header_nik_teknisi
    ON inventory.transaction_used_header (nik_teknisi);


-- ----------------------------------------------------------------------------
-- 2. Cold Archive Tables
-- ----------------------------------------------------------------------------

-- 2.1 WO Lensa Header & List Archive
CREATE TABLE IF NOT EXISTS inventory.wo_lensa_header_archive (
    LIKE inventory.wo_lensa_header INCLUDING DEFAULTS INCLUDING GENERATED
);
ALTER TABLE inventory.wo_lensa_header_archive
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_archive_pemakaian_id
    ON inventory.wo_lensa_header_archive (pemakaian_id);

CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_archive_formatted_date
    ON inventory.wo_lensa_header_archive (formatted_date DESC);

CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_archive_archived_at
    ON inventory.wo_lensa_header_archive (archived_at DESC);


CREATE TABLE IF NOT EXISTS inventory.wo_lensa_list_archive (
    LIKE inventory.wo_lensa_list INCLUDING DEFAULTS INCLUDING GENERATED
);
ALTER TABLE inventory.wo_lensa_list_archive
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_wo_lensa_list_archive_header_id
    ON inventory.wo_lensa_list_archive (header_id);


-- 2.2 Out Lensa Ref Header & List Archive
CREATE TABLE IF NOT EXISTS inventory.out_lensa_ref_header_archive (
    LIKE inventory.out_lensa_ref_header INCLUDING DEFAULTS INCLUDING GENERATED
);
ALTER TABLE inventory.out_lensa_ref_header_archive
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_header_archive_gi_number
    ON inventory.out_lensa_ref_header_archive (gi_number);

CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_header_archive_formatted_date
    ON inventory.out_lensa_ref_header_archive (formatted_date DESC);

CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_header_archive_archived_at
    ON inventory.out_lensa_ref_header_archive (archived_at DESC);


CREATE TABLE IF NOT EXISTS inventory.out_lensa_ref_list_archive (
    LIKE inventory.out_lensa_ref_list INCLUDING DEFAULTS INCLUDING GENERATED
);
ALTER TABLE inventory.out_lensa_ref_list_archive
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_list_archive_header_id
    ON inventory.out_lensa_ref_list_archive (header_id);


-- ----------------------------------------------------------------------------
-- 3. Stored Procedure for Safe Archival of Reconciled Records
-- ----------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE inventory.sp_archive_old_inventory_records(
    p_cutoff_months INTEGER DEFAULT 6,
    p_prune_log_days INTEGER DEFAULT 60
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_cutoff_date DATE;
    v_log_cutoff TIMESTAMPTZ;
    v_wo_count INTEGER := 0;
    v_out_count INTEGER := 0;
    v_log_count INTEGER := 0;
BEGIN
    v_cutoff_date := (CURRENT_DATE - (p_cutoff_months || ' months')::INTERVAL)::DATE;
    v_log_cutoff := CURRENT_TIMESTAMP - (p_prune_log_days || ' days')::INTERVAL;

    -- 3.1 Archive reconciled WO Lensa records older than cutoff date
    CREATE TEMP TABLE tmp_wo_to_archive ON COMMIT DROP AS
    SELECT id
    FROM inventory.wo_lensa_header
    WHERE rekon_check IS TRUE
      AND formatted_date IS NOT NULL
      AND formatted_date < v_cutoff_date;

    IF EXISTS (SELECT 1 FROM tmp_wo_to_archive) THEN
        INSERT INTO inventory.wo_lensa_list_archive (
            id, header_id, material_id, material_desc, qty_pemakaian, uom, created_at, archived_at
        )
        SELECT l.id, l.header_id, l.material_id, l.material_desc, l.qty_pemakaian, l.uom, l.created_at, CURRENT_TIMESTAMP
        FROM inventory.wo_lensa_list l
        JOIN tmp_wo_to_archive t ON l.header_id = t.id;

        INSERT INTO inventory.wo_lensa_header_archive (
            id, pemakaian_id, gi_number, nama_gudang, nik_pemakai, tanggal_update,
            type, wbs, wo_number, created_at, formatted_date, rekon_check, archived_at
        )
        SELECT h.id, h.pemakaian_id, h.gi_number, h.nama_gudang, h.nik_pemakai, h.tanggal_update,
               h.type, h.wbs, h.wo_number, h.created_at, h.formatted_date, h.rekon_check, CURRENT_TIMESTAMP
        FROM inventory.wo_lensa_header h
        JOIN tmp_wo_to_archive t ON h.id = t.id;

        DELETE FROM inventory.wo_lensa_list l
        USING tmp_wo_to_archive t
        WHERE l.header_id = t.id;

        DELETE FROM inventory.wo_lensa_header h
        USING tmp_wo_to_archive t
        WHERE h.id = t.id;

        GET DIAGNOSTICS v_wo_count = ROW_COUNT;
    END IF;

    -- 3.2 Archive reconciled Out Lensa records older than cutoff date
    CREATE TEMP TABLE tmp_out_to_archive ON COMMIT DROP AS
    SELECT id
    FROM inventory.out_lensa_ref_header
    WHERE sap_out_check IS TRUE
      AND formatted_date IS NOT NULL
      AND formatted_date < v_cutoff_date;

    IF EXISTS (SELECT 1 FROM tmp_out_to_archive) THEN
        INSERT INTO inventory.out_lensa_ref_list_archive (
            id, header_id, material_id, material_desc, qty_approve, created_at, archived_at
        )
        SELECT l.id, l.header_id, l.material_id, l.material_desc, l.qty_approve, l.created_at, CURRENT_TIMESTAMP
        FROM inventory.out_lensa_ref_list l
        JOIN tmp_out_to_archive t ON l.header_id = t.id;

        INSERT INTO inventory.out_lensa_ref_header_archive (
            id, reservation_id, project_id, mitra, nik_pemakai, tgl_entry, formatted_date,
            nama_gudang, regional, reservation_id_sap, scraped_by_username, gi_number,
            status_proses, sap_out_check, created_at, updated_at, archived_at
        )
        SELECT h.id, h.reservation_id, h.project_id, h.mitra, h.nik_pemakai, h.tgl_entry, h.formatted_date,
               h.nama_gudang, h.regional, h.reservation_id_sap, h.scraped_by_username, h.gi_number,
               h.status_proses, h.sap_out_check, h.created_at, h.updated_at, CURRENT_TIMESTAMP
        FROM inventory.out_lensa_ref_header h
        JOIN tmp_out_to_archive t ON h.id = t.id;

        DELETE FROM inventory.out_lensa_ref_list l
        USING tmp_out_to_archive t
        WHERE l.header_id = t.id;

        DELETE FROM inventory.out_lensa_ref_header h
        USING tmp_out_to_archive t
        WHERE h.id = t.id;

        GET DIAGNOSTICS v_out_count = ROW_COUNT;
    END IF;

    -- 3.3 Prune transient scraper logs
    DELETE FROM inventory.scraper_cronjob_log
    WHERE timestamp < v_log_cutoff;
    GET DIAGNOSTICS v_log_count = ROW_COUNT;

    RAISE NOTICE 'Archival complete: % WO headers, % Out Lensa headers archived; % logs pruned.',
        v_wo_count, v_out_count, v_log_count;
END;
$$;

REVOKE EXECUTE ON PROCEDURE inventory.sp_archive_old_inventory_records(INTEGER, INTEGER) FROM PUBLIC;
