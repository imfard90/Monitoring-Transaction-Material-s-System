-- ============================================================================
-- Migration: 065_set_rekon_check_true_october_wo_lensa.sql
-- Description:
-- Set rekon_check = TRUE pada inventory.wo_lensa_header khusus periode
-- Oktober 2026 (formatted_date >= '2026-10-01' AND formatted_date <= '2026-10-31')
-- sebagai pemutihan/normalisasi data historis masa transisi/cutoff uji coba.
-- Terbatas HANYA untuk periode Oktober 2026 (November dst tetap validasi ketat).
-- ============================================================================

UPDATE inventory.wo_lensa_header
SET rekon_check = TRUE
WHERE formatted_date >= '2026-10-01' AND formatted_date <= '2026-10-31'
  AND (rekon_check IS FALSE OR rekon_check IS NULL);
