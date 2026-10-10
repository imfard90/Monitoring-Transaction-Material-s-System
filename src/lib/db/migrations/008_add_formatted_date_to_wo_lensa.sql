-- Migration: Add formatted_date column to wo_lensa_header
-- Idempotent: uses IF NOT EXISTS (safe to re-run)
ALTER TABLE inventory.wo_lensa_header ADD COLUMN IF NOT EXISTS formatted_date DATE;
