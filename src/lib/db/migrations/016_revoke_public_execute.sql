-- Migration: L3 — REVOKE EXECUTE FROM PUBLIC on all inventory SPs/functions
-- Description: Live DB audit (L3) found EXECUTE granted to PUBLIC on all 19 stored
--              procedures/functions in schema inventory. This allows any role (including
--              future untrusted roles) to CALL sensitive SPs like sp_sap_out,
--              sp_record_material_used, sp_return_material, etc.
--
-- Approach (per user decision: "REVOKE + GRANT ke imam — defense-in-depth"):
--   1. REVOKE EXECUTE ON ALL FUNCTIONS/PROCEDURES IN SCHEMA inventory FROM PUBLIC
--   2. GRANT EXECUTE explicitly TO imam (the app runtime role)
--      Note: imam is currently superuser, so GRANT is technically redundant (superuser
--      bypasses permission checks). However, this is defense-in-depth: when L2 is
--      executed and imam's superuser is revoked, the explicit GRANT ensures app
--      continues to function without interruption.
--   3. ALTER DEFAULT PRIVILEGES: future SPs/functions created in inventory will NOT
--      automatically grant EXECUTE to PUBLIC.
--
-- Impact analysis (verified before execution):
--   - imam (superuser):       unaffected — superuser bypasses all permission checks
--   - postgres (superuser):   unaffected — used by pg_cron for nightly stock policy job
--   - pg_cron job (jobid=1):  runs as postgres → unaffected
--   - No SPs exist in auth/hr schemas (only inventory has 19 routines)
--   - mtms_app role:          does NOT exist yet (will be created in L2). When created,
--                             it will need explicit GRANT EXECUTE (part of L2 migration).

-- ============================================================================
-- Step 1: REVOKE EXECUTE FROM PUBLIC on all existing functions & procedures
-- ============================================================================
-- PostgreSQL default grants EXECUTE on functions/procedures to PUBLIC.
-- This is overly permissive for application schemas.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory FROM PUBLIC;
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA inventory FROM PUBLIC;

-- ============================================================================
-- Step 2: GRANT EXECUTE explicitly TO imam (app runtime role)
-- ============================================================================
-- Defense-in-depth: even though imam is currently superuser (bypasses checks),
-- this explicit grant ensures continuity when L2 creates a non-superuser role
-- or revokes superuser from imam.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory TO imam;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA inventory TO imam;

-- ============================================================================
-- Step 3: ALTER DEFAULT PRIVILEGES for future SPs/functions
-- ============================================================================
-- By default, PostgreSQL grants EXECUTE on newly created functions/procedures to PUBLIC.
-- This ALTER ensures that any SP/function created in inventory schema after this
-- migration will NOT automatically be executable by PUBLIC.
-- The creator (imam) retains EXECUTE implicitly as the owner.
-- Note: ALTER DEFAULT PRIVILEGES supports FUNCTIONS and ROUTINES (not PROCEDURES).
--       FUNCTIONS = ROUTINES in this context (both cover functions and procedures).
--       We use ROUTINES as the preferred standard term (PostgreSQL docs recommendation).
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

-- Note: Migration runner (run-migration.ts) automatically logs this file
--       in inventory._migration_log (filename column) upon successful execution.

-- ============================================================================
-- Verification (informational — run manually to confirm)
-- ============================================================================
-- After migration, PUBLIC should have 0 EXECUTE grants on inventory routines:
--   SELECT count(*) AS public_execute_count
--   FROM information_schema.role_routine_grants
--   WHERE routine_schema = 'inventory' AND grantee = 'PUBLIC';
--   Expected: 0
--
-- imam should have EXECUTE on all 19 routines:
--   SELECT count(*) AS imam_execute_count
--   FROM information_schema.role_routine_grants
--   WHERE routine_schema = 'inventory' AND grantee = 'imam';
--   Expected: 19
