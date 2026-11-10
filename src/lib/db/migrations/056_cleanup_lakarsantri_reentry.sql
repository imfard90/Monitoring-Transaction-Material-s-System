-- ============================================================================
-- Migration: 056_cleanup_lakarsantri_reentry.sql
-- Description:
-- Clean up SO Lakarsantri records re-entered into wo_lensa tables due to in-flight
-- background scraper running during previous migration 055.
-- ============================================================================

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

