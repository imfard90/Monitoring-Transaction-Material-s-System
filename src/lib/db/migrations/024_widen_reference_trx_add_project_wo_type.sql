-- Migration 024: Widen stock_movement.reference_trx and add 'project' WO type
--
-- Problem 1 (Bug): "value too long for type character varying(50)"
--   id_trx format: TRX-USED-{nik}-{sap_number}-{wo_number}-{yymm}{seq}
--   This id_trx is stored in two places:
--     a) transaction_used_header.id_trx      VARCHAR(150) — fine
--     b) stock_movement.reference_trx        VARCHAR(50)  — OVERFLOW when WO number > ~12 chars
--   Existing data shows max id_trx = exactly 50 chars; any longer WO number crashes the SP.
--   Fix: Widen reference_trx to VARCHAR(200) to match the transaction_used_header.id_trx capacity.
--
-- Problem 2 (Feature): Add 'project' as a new valid WO type.
--   Current enum: assurance, lintas_arta, mtel, myrep, psb, qe/gamas
--   sp_submit_rekon_intech accepts p_wo_type VARCHAR and casts via LOWER(TRIM(REPLACE(...))),
--   so the SP body needs no changes — only the enum type must be extended.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in PostgreSQL < 12.
--       PostgreSQL 12+ allows it. This migration is safe on PG 12+.

-- 1. Widen stock_movement.reference_trx from VARCHAR(50) to VARCHAR(200)
--    Idempotent: widening a varchar column never requires data migration and is safe to re-run
--    (PG will no-op if the new length equals or exceeds the current max length of existing data).
ALTER TABLE inventory.stock_movement
    ALTER COLUMN reference_trx TYPE VARCHAR(200);

-- 2. Add 'project' to enum_wo_type
--    IF NOT EXISTS guard (PG 9.6+) makes this safe to re-run.
ALTER TYPE inventory.enum_wo_type ADD VALUE IF NOT EXISTS 'project';
