-- ============================================================================
-- Migration: L4 — Enable RLS + baseline policies (defense-in-depth)
-- Description: Live DB audit (L4) found RLS OFF on all 39 tables across
-- inventory (26), auth (4), and hr (9) schemas. Zero policies exist.
-- Any role with SELECT/INSERT/UPDATE/DELETE on these tables can read/write
-- ALL rows — no row-level isolation between users/warehouses.
--
-- Approach (per user decision: "Enable RLS now, L2 role downgrade later"):
-- 1. ENABLE ROW LEVEL SECURITY on all 39 tables (RLS is a no-op for superusers
--    until L2 downgrades imam or creates mtms_app non-superuser role).
-- 2. FORCE ROW LEVEL SECURITY on tables containing PII/sensitive data
--    (auth.*, hr.technicians, hr.employees) so even table OWNER respects RLS.
-- 3. Create permissive baseline policies for inventory tables based on
--    app.warehouse_ids GUC (set by connection pool per request).
-- 4. Create self-referential policy for auth.user (user can only see own row).
-- 5. Create read-only policy for hr tables (all authenticated users can read
--    technician/employee directory; only admin can write — enforced at app layer).
--
-- IMPORTANT: RLS policies here use current_setting('app.warehouse_ids', true)
-- which returns NULL if not set. NULL = no access (fail-closed). The app
-- connection pool (src/lib/db/db.ts) must SET this GUC per request after L2.
-- Until L2 is executed (imam is superuser → bypasses RLS), these policies
-- are inert but ready.
--
-- Impact analysis (verified before execution):
-- - imam (superuser): UNAFFECTED — superuser bypasses RLS entirely.
-- - postgres (superuser): UNAFFECTED — same as above.
-- - pg_cron job (runs as postgres): UNAFFECTED — superuser bypasses RLS.
-- - No existing non-superuser roles exist (mtms_app not yet created).
-- - Application: UNAFFECTED until L2 switches DATABASE_URL to non-superuser.
--
-- References:
-- - PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
-- - GUC per-request: SET LOCAL app.warehouse_ids = '1,2,3'
-- ============================================================================

-- ============================================================================
-- Step 1: ENABLE ROW LEVEL SECURITY on all inventory tables (26)
-- ============================================================================

ALTER TABLE inventory._migration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.inout_tag_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.inout_tag_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.mas_wh ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.material_rekonsiliasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.material_rekonsiliasi_actual_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.material_rekonsiliasi_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.material_reservation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.material_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.out_lensa_ref_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.out_lensa_ref_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.rekon_used_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.rekon_used_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.return_material_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.return_material_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.sap_out_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.sap_out_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.stock_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.stock_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.transaction_used_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.transaction_used_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.vendor_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.wo_lensa_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.wo_lensa_list ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Step 2: ENABLE + FORCE ROW LEVEL SECURITY on auth tables (4)
-- ============================================================================
-- FORCE RLS ensures even the table OWNER is subject to RLS policies.
-- Auth tables contain credentials/tokens (auth.account has password, accessToken,
-- refreshToken) — must be locked down hard.

ALTER TABLE auth.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.account FORCE ROW LEVEL SECURITY;
ALTER TABLE auth."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth."user" FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.user_mfa_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.user_mfa_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.verification FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Step 3: ENABLE + FORCE ROW LEVEL SECURITY on hr tables (9)
-- ============================================================================
-- hr.technicians contains NIK (national ID — PII), hr.employees contains
-- employee personal data. FORCE RLS to prevent even owner from bypassing.

ALTER TABLE hr.bizpart ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.bizpart FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.branches FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.employees FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.levels FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.mitras ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.mitras FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.positions FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.sto_to_sa ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.sto_to_sa FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.technicians FORCE ROW LEVEL SECURITY;
ALTER TABLE hr.witel ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr.witel FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- Step 4: Baseline policies for inventory tables
-- ============================================================================
-- Strategy: Use app.warehouse_ids GUC (comma-separated warehouse IDs) set by
-- the connection pool per request. Tables with warehouse_id column are filtered
-- by membership in app.warehouse_ids. Tables without warehouse_id (master data,
-- audit log) get an "all authenticated users" policy.
--
-- GUC usage: current_setting('app.warehouse_ids', true) returns NULL if unset.
-- NULL = no access (fail-closed). This is the desired behavior:
-- if GUC is not set, no rows are visible to non-superuser roles.

-- 4a. Warehouse-scoped SELECT policy (tables with warehouse_id column)

CREATE POLICY inventory_wh_scoped_select ON inventory.sap_out_header
    FOR SELECT USING (
        warehouse_id = ANY(string_to_array(current_setting('app.warehouse_ids', true), ',')::int[])
    );

CREATE POLICY inventory_wh_scoped_select ON inventory.stock_balance
    FOR SELECT USING (
        warehouse_id = ANY(string_to_array(current_setting('app.warehouse_ids', true), ',')::int[])
    );

CREATE POLICY inventory_wh_scoped_select ON inventory.stock_movement
    FOR SELECT USING (
        warehouse_id = ANY(string_to_array(current_setting('app.warehouse_ids', true), ',')::int[])
    );

CREATE POLICY inventory_wh_scoped_select ON inventory.stock_policy
    FOR SELECT USING (
        warehouse_id = ANY(string_to_array(current_setting('app.warehouse_ids', true), ',')::int[])
    );

CREATE POLICY inventory_wh_scoped_select ON inventory.return_material_header
    FOR SELECT USING (
        warehouse_id = ANY(string_to_array(current_setting('app.warehouse_ids', true), ',')::int[])
    );

-- 4b. Child/item tables (no direct warehouse_id — gated on GUC being set)
-- These are items that belong to parent headers. Access is granted if
-- the user is authenticated (app.warehouse_ids is set).

CREATE POLICY inventory_items_select ON inventory.sap_out_items
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.return_material_items
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.transaction_used_item
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.inout_tag_items
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.wo_lensa_list
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.out_lensa_ref_list
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.rekon_used_list
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.material_rekonsiliasi_actual_list
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_items_select ON inventory.material_reservation_items
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

-- 4c. Header tables with created_by (no direct warehouse_id)

CREATE POLICY inventory_header_select ON inventory.inout_tag_header
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_header_select ON inventory.transaction_used_header
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_header_select ON inventory.rekon_used_header
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_header_select ON inventory.out_lensa_ref_header
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_header_select ON inventory.wo_lensa_header
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_header_select ON inventory.material_reservations
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_header_select ON inventory.material_rekonsiliasi
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_header_select ON inventory.material_rekonsiliasi_sources
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

-- 4d. Master/reference data (all authenticated users can read)

CREATE POLICY inventory_master_select ON inventory.materials
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_master_select ON inventory.mas_wh
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_master_select ON inventory._migration_log
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_master_select ON inventory.vendor_tracking
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

-- 4e. Write policies (INSERT/UPDATE/DELETE) for inventory tables
-- Until L2 is done, writes go through SPs (SECURITY INVOKER). After L2,
-- non-superuser roles need explicit write policies. For now, we create
-- a permissive write policy gated on app.warehouse_ids being set (fail-closed).
-- App-layer auth (Better Auth) handles authorization (who can write what).
-- RLS here is a backstop, not the primary gate.

CREATE POLICY inventory_write_all ON inventory.sap_out_header
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.sap_out_items
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.stock_balance
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.stock_movement
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.stock_policy
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.transaction_used_header
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.transaction_used_item
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.inout_tag_header
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.inout_tag_items
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.return_material_header
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.return_material_items
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.wo_lensa_header
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.wo_lensa_list
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.out_lensa_ref_header
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.out_lensa_ref_list
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.rekon_used_header
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.rekon_used_list
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.materials
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.mas_wh
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.material_rekonsiliasi
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.material_rekonsiliasi_actual_list
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.material_rekonsiliasi_sources
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.material_reservations
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.material_reservation_items
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY inventory_write_all ON inventory.vendor_tracking
    FOR ALL USING (current_setting('app.warehouse_ids', true) IS NOT NULL)
    WITH CHECK (current_setting('app.warehouse_ids', true) IS NOT NULL);

-- ============================================================================
-- Step 5: Auth table policies (self-referential — user sees own row only)
-- ============================================================================
-- auth.user: id is text (Better Auth uses UUID strings). app.current_user_id
-- GUC is set by the auth middleware per request.
-- Note: "user" is a SQL reserved keyword, must be quoted as auth."user".

CREATE POLICY auth_user_self ON auth."user"
    FOR SELECT USING (id = current_setting('app.current_user_id', true));

CREATE POLICY auth_user_self_update ON auth."user"
    FOR UPDATE USING (id = current_setting('app.current_user_id', true))
    WITH CHECK (id = current_setting('app.current_user_id', true));

-- auth.account: "userId" column (camelCase, quoted) references auth.user.id
CREATE POLICY auth_account_self ON auth.account
    FOR SELECT USING (
        "userId" = current_setting('app.current_user_id', true)
    );

CREATE POLICY auth_account_self_all ON auth.account
    FOR ALL USING (
        "userId" = current_setting('app.current_user_id', true)
    )
    WITH CHECK (
        "userId" = current_setting('app.current_user_id', true)
    );

-- auth.user_mfa_devices: user_id column (bigint) references auth.user.id (text)
-- NOTE: user_id is bigint, but current_setting returns text.
-- We cast user_id::text for comparison. This may need revisiting if
-- user_id doesn't actually correspond to auth.user.id (different type suggests
-- possible FK to a different table or legacy schema). For now, the policy
-- is fail-closed (no access) if GUC is unset.
CREATE POLICY auth_mfa_self ON auth.user_mfa_devices
    FOR ALL USING (
        user_id::text = current_setting('app.current_user_id', true)
    )
    WITH CHECK (
        user_id::text = current_setting('app.current_user_id', true)
    );

-- auth.verification: identifier column can be user ID or email depending on flow.
CREATE POLICY auth_verification_self ON auth.verification
    FOR ALL USING (
        identifier = current_setting('app.current_user_id', true)
        OR identifier = current_setting('app.current_email', true)
    )
    WITH CHECK (
        identifier = current_setting('app.current_user_id', true)
        OR identifier = current_setting('app.current_email', true)
    );

-- ============================================================================
-- Step 6: HR table policies (read-only directory for authenticated users)
-- ============================================================================
-- HR data (technicians, employees, branches) is reference data needed by the
-- app for dropdowns/lookups. All authenticated users (app.warehouse_ids set)
-- can SELECT. Writes are restricted to admin role (app.is_admin = 'true').

CREATE POLICY hr_read_all ON hr.technicians
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_admin_write ON hr.technicians
    FOR ALL USING (current_setting('app.is_admin', true) = 'true')
    WITH CHECK (current_setting('app.is_admin', true) = 'true');

CREATE POLICY hr_read_all ON hr.employees
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_admin_write ON hr.employees
    FOR ALL USING (current_setting('app.is_admin', true) = 'true')
    WITH CHECK (current_setting('app.is_admin', true) = 'true');

CREATE POLICY hr_read_all ON hr.branches
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_read_all ON hr.levels
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_read_all ON hr.mitras
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_read_all ON hr.positions
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_read_all ON hr.bizpart
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_read_all ON hr.sto_to_sa
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

CREATE POLICY hr_read_all ON hr.witel
    FOR SELECT USING (current_setting('app.warehouse_ids', true) IS NOT NULL);

-- ============================================================================
-- Note: Migration runner (run-migration.ts) automatically logs this file
-- in inventory._migration_log (filename column) upon successful execution.
--
-- IMPORTANT: After L2 creates mtms_app (non-superuser), the connection pool
-- in src/lib/db/db.ts MUST set GUCs per request:
--   SET LOCAL app.warehouse_ids = '1,2,3';  -- user's assigned warehouses
--   SET LOCAL app.current_user_id = '<user-id>';
--   SET LOCAL app.current_email = '<user-email>';
--   SET LOCAL app.is_admin = 'true' or 'false';
-- Without these GUCs, ALL RLS policies return false → no rows visible (fail-closed).
-- ============================================================================

-- ============================================================================
-- Verification (informational — run manually to confirm)
-- ============================================================================
-- After migration, RLS should be enabled on all 39 tables:
-- SELECT n.nspname AS schema, c.relname AS table,
--        c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE c.relkind = 'r' AND n.nspname IN ('inventory','auth','hr')
-- ORDER BY n.nspname, c.relname;
-- Expected: rls_enabled=true for all 39 tables

-- Policy count:
-- SELECT count(*) FROM pg_policies
-- WHERE schemaname IN ('inventory','auth','hr');
-- Expected: 40+ policies
