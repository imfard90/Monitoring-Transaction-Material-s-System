-- Migration: Add rekon_check flag to wo_lensa_header
-- Description: Adds BOOLEAN rekon_check column to track WO Lensa Ref items reconciled
-- Business logic:
-- - rekon_check = TRUE  → WO sudah di-submit ke Rekon Lensa (ada di inventory.rekon_used_header)
-- - rekon_check = FALSE → belum di-rekon
-- - NULL → belum pernah dicek (belum ada rekon_used_header record)
--
-- Idempotent: uses IF NOT EXISTS (safe to re-run)

-- 1. Add column
ALTER TABLE inventory.wo_lensa_header
ADD COLUMN IF NOT EXISTS rekon_check BOOLEAN DEFAULT FALSE;

-- 2. Backfill: set rekon_check = TRUE untuk semua WO yang sudah masuk rekon_used_header
-- Join via CAST(pemakaian_id AS VARCHAR) = id_pemakaian
UPDATE inventory.wo_lensa_header wlh
SET rekon_check = TRUE
FROM inventory.rekon_used_header ruh
WHERE CAST(wlh.pemakaian_id AS VARCHAR) = ruh.id_pemakaian
  AND (wlh.rekon_check IS FALSE OR wlh.rekon_check IS NULL);

-- 3. Add comment for documentation
COMMENT ON COLUMN inventory.wo_lensa_header.rekon_check IS
'TRUE jika WO sudah di-submit ke Rekon Lensa (ada di rekon_used_header).';

-- 4. Partial index for fast lookups (only rows where rekon_check is set)
CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_rekon_check
ON inventory.wo_lensa_header(rekon_check)
WHERE rekon_check IS NOT NULL;
