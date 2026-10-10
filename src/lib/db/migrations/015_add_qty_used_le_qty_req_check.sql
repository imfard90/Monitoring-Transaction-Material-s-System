-- Migration: L1 — Add CHECK (qty_used <= qty_req) to sap_out_items
-- Description: Live DB audit (L1) found 27 rows in sap_out_items where qty_used > qty_req
--              (overflow up to +150). 9/10 involve designator_id=16 — systematic, not one-off.
--              No CHECK constraint existed to prevent this.
--
-- Root cause: SPs in migrations 004/005/006/012/013 already have qty validation,
--             but 27 rows were created before those SPs were deployed (or via legacy app path).
--             The CHECK constraint provides defense-in-depth at the DB level.
--
-- Approach (per user decision: "Koreksi langsung"):
--   1. Cap qty_used = qty_req for 27 violating rows (no returns exist for any of them — verified)
--   2. Add CHECK constraint WITHOUT NOT VALID (data is now clean, so it will succeed)
--   3. Log the data correction in _migration_log for audit trail
--
-- Audit context:
--   - 27 rows: 9/10 involve designator_id=16 (material AC-OF-SM-1-3SL, "DC FO aerial 1 Core SM G657A 3 Sling")
--   - 7 rows have end_status='close', 20 have end_status='intech' in their headers
--   - 0/27 have return_material_items records (capping is safe — no return to invalidate)
--   - Existing CHECK: sap_out_items_qty_check CHECK (qty_req > 0)

-- ============================================================================
-- Step 1: Cap qty_used = qty_req for all violating rows
-- ============================================================================
UPDATE inventory.sap_out_items
SET qty_used = qty_req
WHERE qty_used > qty_req;

-- Verify: should be 0 after correction
-- (run in verification step below)

-- ============================================================================
-- Step 2: Add CHECK constraint (qty_used IS NULL OR qty_used <= qty_req)
-- ============================================================================
-- qty_used is nullable (is_nullable=YES in schema). NULL means "not yet used/reconciled".
-- The constraint allows NULL (no reconciliation yet) but prevents qty_used > qty_req.

ALTER TABLE inventory.sap_out_items
  ADD CONSTRAINT sap_out_items_qty_used_le_req
  CHECK (qty_used IS NULL OR qty_used <= qty_req);

-- Note: Migration runner (run-migration.ts) automatically logs this file
--       in inventory._migration_log (filename column) upon successful execution.

-- ============================================================================
-- Verification (informational — will show 0 violations after fix)
-- ============================================================================
-- SELECT count(*) FILTER (WHERE qty_used > qty_req) AS violations
-- FROM inventory.sap_out_items;
-- Expected: 0
