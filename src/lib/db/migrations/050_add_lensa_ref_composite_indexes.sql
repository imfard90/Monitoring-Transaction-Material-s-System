-- ============================================================================
-- Migration: 050_add_lensa_ref_composite_indexes.sql
-- Description:
--   Add composite B-tree indexes for compound queries filtering by both
--   (nama_gudang, formatted_date) on inventory.wo_lensa_header and
--   inventory.out_lensa_ref_header. Replaces slower separate BitmapAnd index scans.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_wh_date 
ON inventory.wo_lensa_header (nama_gudang, formatted_date);

CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_header_wh_date 
ON inventory.out_lensa_ref_header (nama_gudang, formatted_date);

COMMENT ON INDEX inventory.idx_wo_lensa_header_wh_date IS 'Composite index for simultaneous warehouse and date filtering on WO Lensa';
COMMENT ON INDEX inventory.idx_out_lensa_ref_header_wh_date IS 'Composite index for simultaneous warehouse and date filtering on Out Lensa Ref';
