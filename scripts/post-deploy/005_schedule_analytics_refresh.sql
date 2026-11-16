-- Post-Deploy Script: Schedule pg_cron recurring analytics materialized view refresh (every hour)
--
-- Prerequisites:
--   1. pg_cron extension enabled in postgresql.conf:
--        shared_preload_libraries = 'pg_cron'
--   2. Migration 063_setup_analytics_schema_and_mviews.sql must have been applied.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/post-deploy/005_schedule_analytics_refresh.sql
--
-- This script is idempotent: it unschedules any existing job with old names
-- before creating a new one, so it is safe to re-run.

-- Remove old schedule if present (idempotent)
SELECT cron.unschedule('refresh_analytics_mviews_hourly')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh_analytics_mviews_hourly'
);

-- Schedule recurring every hour at minute 0: '0 * * * *'
SELECT cron.schedule(
    'refresh_analytics_mviews_hourly',
    '0 * * * *',
    'CALL analytics.sp_refresh_analytics_mviews()'
);

-- Use Unix Domain Socket (/var/run/postgresql) and superuser 'postgres' to avoid TCP connection authentication failures
UPDATE cron.job 
SET nodename = '/var/run/postgresql', 
    username = 'postgres' 
WHERE jobname = 'refresh_analytics_mviews_hourly';
