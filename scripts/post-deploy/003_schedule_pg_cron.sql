-- Post-Deploy Script: Schedule pg_cron recurring stock policy job (every 2 hours)
--
-- Prerequisites:
--   1. pg_cron extension enabled in postgresql.conf:
--        shared_preload_libraries = 'pg_cron'
--      (requires PostgreSQL restart)
--   2. Migration 003_setup_pg_cron_stock_policy.sql and 053_create_stock_policy_log_and_sp_audit.sql
--      must have been applied
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/post-deploy/003_schedule_pg_cron.sql
--
-- This script is idempotent: it unschedules any existing job with old names
-- before creating a new one, so it is safe to re-run.

-- Remove old schedules if present (idempotent)
SELECT cron.unschedule('calculate_stock_policy_nightly')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'calculate_stock_policy_nightly'
);

SELECT cron.unschedule('calculate_stock_policy_recurring')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'calculate_stock_policy_recurring'
);

-- Schedule recurring every 2 hours: '0 */2 * * *'
SELECT cron.schedule(
    'calculate_stock_policy_recurring',
    '0 */2 * * *',
    'CALL inventory.sp_calculate_stock_policy_nightly()'
);

-- Use Unix Domain Socket (/var/run/postgresql) and superuser 'postgres' to avoid TCP connection authentication failures
UPDATE cron.job 
SET nodename = '/var/run/postgresql', 
    username = 'postgres' 
WHERE jobname = 'calculate_stock_policy_recurring';
