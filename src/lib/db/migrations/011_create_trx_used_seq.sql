-- Migration: Create deterministic sequence for id_trx generation
-- Description: Replaces COUNT(*)-based id_trx generation with a PostgreSQL SEQUENCE
--              to prevent race conditions and collisions on concurrent inserts.
--
-- P0-D2 fix: The old approach used:
--   SELECT COUNT(*) FROM inventory.transaction_used_header WHERE to_char(created_at,'YYMM') = yymm
-- then incremented in application code. This is not concurrency-safe.
--
-- New approach: App calls nextval('inventory.trx_used_seq') to get a unique 4-digit
-- zero-padded sequence number, then formats: TRX-USED-{nik}-{sap}-{wo}-{yymm}{seq}
--
-- Note: These sequences are NO CYCLE and will raise an error if they exceed max (9999).
--       For monthly reset, a cron job can setval() back to 1 at month boundaries.

-- Sequence for Rekon Intech (TRX-USED-...)
CREATE SEQUENCE IF NOT EXISTS inventory.trx_used_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 9999
    NO CYCLE;

GRANT USAGE, SELECT ON SEQUENCE inventory.trx_used_seq TO PUBLIC;

-- Sequence for Rekon Lensa (TRX-USED-LENSA-...)
CREATE SEQUENCE IF NOT EXISTS inventory.trx_used_lensa_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 9999
    NO CYCLE;

GRANT USAGE, SELECT ON SEQUENCE inventory.trx_used_lensa_seq TO PUBLIC;

-- Sequence for SAP OUT (TRX-OUT-...)
CREATE SEQUENCE IF NOT EXISTS inventory.trx_out_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 9999
    NO CYCLE;

GRANT USAGE, SELECT ON SEQUENCE inventory.trx_out_seq TO PUBLIC;
