-- ============================================================================
-- Migration: 054_drop_duplicate_indexes.sql
-- Description:
--   Removes 5 redundant/duplicate B-tree indexes identified during database health audit.
--   Each dropped index has an identical UNIQUE constraint or another identical
--   B-tree index covering the exact same table and column(s).
--
-- Redundant Indexes Dropped:
--   1. hr.idx_employees_nik                 -> Covered by hr.employees_nik_key (UNIQUE)
--   2. hr.technicians_idx_nik               -> Covered by hr.technicians_nik_key (UNIQUE)
--   3. inventory.inout_tag_header_index_accept_id -> Covered by inventory.inout_tag_header_accept_id_key (UNIQUE)
--   4. inventory.idx_sap_out_header_warehouse_id  -> Covered by inventory.sap_out_header_idx_warehouse (identical)
--   5. auth.idx_auth_session_token          -> Covered by auth.session_token_key (UNIQUE)
--
-- Rollback Instructions:
--   CREATE INDEX IF NOT EXISTS idx_employees_nik ON hr.employees (nik);
--   CREATE INDEX IF NOT EXISTS technicians_idx_nik ON hr.technicians (nik);
--   CREATE INDEX IF NOT EXISTS inout_tag_header_index_accept_id ON inventory.inout_tag_header (accept_id);
--   CREATE INDEX IF NOT EXISTS idx_sap_out_header_warehouse_id ON inventory.sap_out_header (warehouse_id);
--   CREATE INDEX IF NOT EXISTS idx_auth_session_token ON auth.session (token);
-- ============================================================================

DROP INDEX IF EXISTS hr.idx_employees_nik;
DROP INDEX IF EXISTS hr.technicians_idx_nik;
DROP INDEX IF EXISTS inventory.inout_tag_header_index_accept_id;
DROP INDEX IF EXISTS inventory.idx_sap_out_header_warehouse_id;
DROP INDEX IF EXISTS auth.idx_auth_session_token;

