-- Migration 049: Create inventory.scraper_cronjob_log
-- Purpose: Log background and manual scraping execution history and results

CREATE TABLE IF NOT EXISTS inventory.scraper_cronjob_log (
    id BIGSERIAL PRIMARY KEY,
    scraper_type VARCHAR(50) NOT NULL, -- 'out_lensa', 'wo_lensa', 'stock_teknisi', 'other_stock'
    action VARCHAR(20) NOT NULL CHECK (action IN ('system', 'manual')),
    resume_result TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup of latest log per scraper type
CREATE INDEX IF NOT EXISTS idx_scraper_cronjob_log_type_ts 
ON inventory.scraper_cronjob_log (scraper_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_scraper_cronjob_log_ts 
ON inventory.scraper_cronjob_log (timestamp DESC);

-- Enable RLS (defense-in-depth L4 compliance)
ALTER TABLE inventory.scraper_cronjob_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scraper_cronjob_log_select_policy ON inventory.scraper_cronjob_log;
CREATE POLICY scraper_cronjob_log_select_policy ON inventory.scraper_cronjob_log
    FOR SELECT USING (true);

DROP POLICY IF EXISTS scraper_cronjob_log_insert_policy ON inventory.scraper_cronjob_log;
CREATE POLICY scraper_cronjob_log_insert_policy ON inventory.scraper_cronjob_log
    FOR INSERT WITH CHECK (true);

COMMENT ON TABLE inventory.scraper_cronjob_log IS 'Riwayat eksekusi cronjob dan manual scraping MTMS';
COMMENT ON COLUMN inventory.scraper_cronjob_log.scraper_type IS 'Kategori scraper: out_lensa, wo_lensa, stock_teknisi, other_stock';
COMMENT ON COLUMN inventory.scraper_cronjob_log.action IS 'Tipe pemicu: system (cron) atau manual (user button)';
COMMENT ON COLUMN inventory.scraper_cronjob_log.resume_result IS 'Ringkasan hasil eksekusi (data terproses, sukses, gagal)';
COMMENT ON COLUMN inventory.scraper_cronjob_log.timestamp IS 'Waktu eksekusi selesai';

