-- Migration 052: Add exclude_intech_lensa column to hr.technicians
-- Purpose: Store manual material exclusions for technician Lensa stock comparison

ALTER TABLE hr.technicians 
ADD COLUMN IF NOT EXISTS exclude_intech_lensa JSONB DEFAULT NULL;

COMMENT ON COLUMN hr.technicians.exclude_intech_lensa IS 'List of excluded materials for Intech Lensa comparison. Format: [{ id_material: string, nama_material: string, qty: number }]';

