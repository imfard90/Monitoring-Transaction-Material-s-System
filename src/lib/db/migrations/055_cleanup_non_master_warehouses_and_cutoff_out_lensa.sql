-- ============================================================================
-- Migration: 055_cleanup_non_master_warehouses_and_cutoff_out_lensa.sql
-- Description:
-- 1. Remove non-master warehouses (e.g. SO Lakarsantri) from wo_lensa_header & wo_lensa_list.
-- 2. Remove non-master warehouses from out_lensa_ref_header & out_lensa_ref_list.
-- 3. Mark historical Out Lensa Ref (< 2026-10-01) as sap_out_check = TRUE to align
--    with October 2026 cutoff and clear obsolete backlog notifications.
-- ============================================================================

-- 1. Clean non-master warehouses from wo_lensa tables
DELETE FROM inventory.wo_lensa_list
WHERE header_id IN (
    SELECT id FROM inventory.wo_lensa_header
    WHERE NOT EXISTS (
        SELECT 1 FROM inventory.mas_wh w
        WHERE LOWER(REPLACE(w.name, ' ', '')) = LOWER(REPLACE(inventory.wo_lensa_header.nama_gudang, ' ', ''))
    )
);

DELETE FROM inventory.wo_lensa_header
WHERE NOT EXISTS (
    SELECT 1 FROM inventory.mas_wh w
    WHERE LOWER(REPLACE(w.name, ' ', '')) = LOWER(REPLACE(inventory.wo_lensa_header.nama_gudang, ' ', ''))
);

-- 2. Clean non-master warehouses from out_lensa_ref tables
DELETE FROM inventory.out_lensa_ref_list
WHERE header_id IN (
    SELECT id FROM inventory.out_lensa_ref_header
    WHERE NOT EXISTS (
        SELECT 1 FROM inventory.mas_wh w
        WHERE LOWER(REPLACE(w.name, ' ', '')) = LOWER(REPLACE(inventory.out_lensa_ref_header.nama_gudang, ' ', ''))
    )
);

DELETE FROM inventory.out_lensa_ref_header
WHERE NOT EXISTS (
    SELECT 1 FROM inventory.mas_wh w
    WHERE LOWER(REPLACE(w.name, ' ', '')) = LOWER(REPLACE(inventory.out_lensa_ref_header.nama_gudang, ' ', ''))
);

-- 3. Reconcile historical Out Lensa Ref prior to October 2026 cutoff
UPDATE inventory.out_lensa_ref_header
SET sap_out_check = TRUE
WHERE (formatted_date < '2026-10-01' OR (formatted_date IS NULL AND tgl_entry < '2026-10-01'))
  AND (sap_out_check IS FALSE OR sap_out_check IS NULL);
