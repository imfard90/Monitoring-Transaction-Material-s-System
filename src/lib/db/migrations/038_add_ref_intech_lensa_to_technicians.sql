-- Migration 038: Add ref_intech_lensa column to hr.technicians
-- Purpose: Store cached Lensa stock scraping results for bulk comparison

ALTER TABLE hr.technicians 
ADD COLUMN IF NOT EXISTS ref_intech_lensa JSONB DEFAULT NULL;

COMMENT ON COLUMN hr.technicians.ref_intech_lensa IS 'Cached Lensa stock scraping result. Structure: { status: "success"|"failed", scraped_at: ISO8601, error_message?: string, materials: [{ id_material, nama_material, stock_teknisi }] }';

-- Index for filtering by scrape status
CREATE INDEX IF NOT EXISTS idx_technicians_ref_lensa_status 
ON hr.technicians ((ref_intech_lensa->>'status'));

-- Index for filtering by scraped_at timestamp
CREATE INDEX IF NOT EXISTS idx_technicians_ref_lensa_scraped_at 
ON hr.technicians ((ref_intech_lensa->>'scraped_at'));
