-- Post-Deploy Script: bulk Lensa stock scraping schedules
-- Schedules: 00:30, 05:00, 11:00, 19:00, 22:00 WIB
--
-- Prerequisites:
--   1. Migration 038_add_ref_intech_lensa_to_technicians.sql applied
--   2. Scheduled via Next.js instrumentation (src/instrumentation.ts) using node-cron
--      with Redis atomic lock (lock:bulk_stock_scrape).
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/post-deploy/004_schedule_lensa_stock_scraping.sql
--
-- The SQL below documents the schedules and records them in a registry table for observability.

CREATE TABLE IF NOT EXISTS inventory.cron_job_registry (
    job_name TEXT PRIMARY KEY,
    cron_expression TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Register the 5 scheduled bulk stock scraping runs
INSERT INTO inventory.cron_job_registry (job_name, cron_expression, description)
VALUES
    ('bulk_stock_scrape_0030', '30 0 * * *', 'Bulk scrape Lensa stock teknisi (batch 50) at 00:30 WIB'),
    ('bulk_stock_scrape_0500', '0 5 * * *',  'Bulk scrape Lensa stock teknisi (batch 50) at 05:00 WIB'),
    ('bulk_stock_scrape_1100', '0 11 * * *', 'Bulk scrape Lensa stock teknisi (batch 50) at 11:00 WIB'),
    ('bulk_stock_scrape_1900', '0 19 * * *', 'Bulk scrape Lensa stock teknisi (batch 50) at 19:00 WIB'),
    ('bulk_stock_scrape_2200', '0 22 * * *', 'Bulk scrape Lensa stock teknisi (batch 50) at 22:00 WIB')
ON CONFLICT (job_name) DO UPDATE
SET cron_expression = EXCLUDED.cron_expression,
    description = EXCLUDED.description;
