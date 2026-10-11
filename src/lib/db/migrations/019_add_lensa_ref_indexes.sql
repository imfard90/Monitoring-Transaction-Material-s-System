-- Migration 019: Performance fix for out-lensa-ref and wo-lensa-ref pages
-- Adds missing indexes on frequently filtered/sorted columns
-- NOTE: Migration log is handled automatically by run-migration.ts

-- ============================================================
-- INDEX: out_lensa_ref_header.nama_gudang
-- Used in: WHERE clause for staff warehouse filter
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_header_nama_gudang
ON inventory.out_lensa_ref_header (nama_gudang);

-- ============================================================
-- INDEX: out_lensa_ref_header.formatted_date DESC
-- Used in: ORDER BY formatted_date DESC (page load default sort)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_header_formatted_date
ON inventory.out_lensa_ref_header (formatted_date DESC);

-- ============================================================
-- INDEX: out_lensa_ref_header.gi_number
-- Used in: UPDATE JOIN with sap_out_header (sap_out_check flag)
-- Also used for header-to-sap-out matching
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_header_gi_number
ON inventory.out_lensa_ref_header (gi_number);

-- ============================================================
-- INDEX: wo_lensa_header.nama_gudang
-- Used in: WHERE clause for staff warehouse filter
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_nama_gudang
ON inventory.wo_lensa_header (nama_gudang);

-- ============================================================
-- INDEX: wo_lensa_header.formatted_date DESC
-- Used in: ORDER BY formatted_date DESC (page load default sort)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_formatted_date
ON inventory.wo_lensa_header (formatted_date DESC);
