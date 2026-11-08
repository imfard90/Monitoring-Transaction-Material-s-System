-- Migration: 029_drop_nte_item_unique_key.sql
-- Allow multiple master item rows with the same type, brand, and model.
-- Rollback: restore uniqueness only after removing duplicate key rows.

BEGIN;

ALTER TABLE nte_inventory.mas_item_nte
    DROP CONSTRAINT IF EXISTS mas_item_nte_type_merek_type_sn_key;

COMMIT;
