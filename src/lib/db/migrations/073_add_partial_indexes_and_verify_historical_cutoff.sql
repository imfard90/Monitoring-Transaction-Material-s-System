-- ============================================================================
-- Migration: 073_add_partial_indexes_and_verify_historical_cutoff.sql
-- Description:
-- 1. Menegakkan batasan cutoff: memastikan seluruh transaksi Out Lensa Ref
--    dan WO Lensa Ref periode Oktober 2026 (periode 10) dan sebelumnya berstatus TRUE.
-- 2. Menambahkan partial indexes presisi pada baris pending (sap_out_check = false,
--    rekon_check = false, dan return_material_header pending) untuk memaksimalkan
--    kecepatan scan antrean harian dan memangkas ukuran index di memory RAM.
-- ============================================================================

-- 1. Normalisasi / pemutihan data historis Out Lensa Ref (Periode Oktober 2026 dan sebelumnya)
UPDATE inventory.out_lensa_ref_header
SET sap_out_check = TRUE
WHERE (formatted_date <= '2026-10-31' OR (formatted_date IS NULL AND tgl_entry <= '2026-10-31'))
  AND (sap_out_check IS FALSE OR sap_out_check IS NULL);

-- 2. Normalisasi / pemutihan data historis WO Lensa Ref (Periode Oktober 2026 dan sebelumnya)
UPDATE inventory.wo_lensa_header
SET rekon_check = TRUE
WHERE (formatted_date <= '2026-10-31' OR (formatted_date IS NULL AND created_at < '2026-11-01'))
  AND (rekon_check IS FALSE OR rekon_check IS NULL);

-- 3. Partial Index untuk Out Lensa Ref yang belum out SAP (sap_out_check = false)
--    Menyediakan Index Scan ultra-cepat untuk antrean pending harian (<50 baris vs 6.000+ baris)
CREATE INDEX IF NOT EXISTS idx_out_lensa_pending_sap
ON inventory.out_lensa_ref_header (nama_gudang, formatted_date DESC)
WHERE sap_out_check = false;

-- 4. Partial Index untuk WO Lensa Ref yang belum rekon (rekon_check = false)
CREATE INDEX IF NOT EXISTS idx_wo_lensa_pending_rekon
ON inventory.wo_lensa_header (nama_gudang, formatted_date DESC)
WHERE rekon_check = false;

-- 5. Partial Index untuk transaksi Return Material yang masih memerlukan tindakan operasional
CREATE INDEX IF NOT EXISTS idx_return_material_pending
ON inventory.return_material_header (warehouse_id, created_at DESC)
WHERE end_status IN ('pending', 'wait_approve', 'requested');
