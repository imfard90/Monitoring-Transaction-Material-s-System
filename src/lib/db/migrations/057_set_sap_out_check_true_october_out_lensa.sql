-- ============================================================================
-- Migration: 057_set_sap_out_check_true_october_out_lensa.sql
-- Description:
-- Set sap_out_check = TRUE pada inventory.out_lensa_ref_header khusus periode
-- Oktober 2026 (formatted_date >= '2026-10-01' AND formatted_date <= '2026-10-31')
-- untuk sisa transaksi uji coba yang masih bernilai FALSE / NULL.
-- ============================================================================

UPDATE inventory.out_lensa_ref_header
SET sap_out_check = TRUE
WHERE formatted_date >= '2026-10-01' AND formatted_date <= '2026-10-31'
  AND (sap_out_check IS FALSE OR sap_out_check IS NULL);
