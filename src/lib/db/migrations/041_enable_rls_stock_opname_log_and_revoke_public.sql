-- ============================================================================
-- Migration: 041_enable_rls_stock_opname_log_and_revoke_public.sql
-- Description:
--   1. Enable RLS on inventory.stock_opname_log (defense-in-depth L4 compliance)
--   2. Add standard baseline RLS policies for stock_opname_log
--   3. Revoke EXECUTE from PUBLIC on all routines in schema inventory
--   4. Grant EXECUTE explicitly to imam (app runtime role)
-- ============================================================================

-- Step 1: Enable RLS on inventory.stock_opname_log
ALTER TABLE inventory.stock_opname_log ENABLE ROW LEVEL SECURITY;

-- Step 2: Add baseline RLS policies for inventory.stock_opname_log
DROP POLICY IF EXISTS stock_opname_log_select_policy ON inventory.stock_opname_log;
CREATE POLICY stock_opname_log_select_policy ON inventory.stock_opname_log
    FOR SELECT USING (true);

DROP POLICY IF EXISTS stock_opname_log_insert_policy ON inventory.stock_opname_log;
CREATE POLICY stock_opname_log_insert_policy ON inventory.stock_opname_log
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS stock_opname_log_update_policy ON inventory.stock_opname_log;
CREATE POLICY stock_opname_log_update_policy ON inventory.stock_opname_log
    FOR UPDATE USING (true);

-- Step 3: Revoke EXECUTE from PUBLIC on all routines in schema inventory
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory FROM PUBLIC;
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA inventory FROM PUBLIC;

-- Step 4: Grant EXECUTE to imam
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory TO imam;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA inventory TO imam;
