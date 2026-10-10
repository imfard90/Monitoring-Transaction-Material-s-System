-- Post-Deploy Script: Schedule pg_cron nightly stock policy job
--
-- Prerequisites:
--   1. pg_cron extension enabled in postgresql.conf:
--        shared_preload_libraries = 'pg_cron'
--      (requires PostgreSQL restart)
--   2. Migration 003_setup_pg_cron_stock_policy.sql must have been applied
--      (creates the pg_cron extension + inventory.sp_calculate_stock_policy_nightly procedure)
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/post-deploy/003_schedule_pg_cron.sql
--
-- This script is idempotent: it unschedules any existing job with the same name
-- before creating a new one, so it is safe to re-run.

-- Remove existing schedule if present (idempotent)
SELECT cron.unschedule('calculate_stock_policy_nightly')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'calculate_stock_policy_nightly'
);

-- Schedule nightly at 01:00 server time
-- Format: '0 1 * * *' (minute 0, hour 1, every day)
SELECT cron.schedule(
    'calculate_stock_policy_nightly',
    '0 1 * * *',
    'CALL inventory.sp_calculate_stock_policy_nightly()'
);
