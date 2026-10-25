-- Migration: 037_add_wh_id_to_technicians.sql
-- Menambahkan kolom wh_id di hr.technicians untuk mapping teknisi ke warehouse

-- Tambah kolom wh_id (nullable)
ALTER TABLE hr.technicians 
ADD COLUMN IF NOT EXISTS wh_id INTEGER REFERENCES inventory.mas_wh(id);

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_technicians_wh_id ON hr.technicians(wh_id);

-- Comment
COMMENT ON COLUMN hr.technicians.wh_id IS 'Gudang tempat teknisi di-assign. NULL = belum di-assign, tidak bisa scrape stock.';
