-- Post-Deploy Script: Schedule pg_cron recurring analytics materialized view refresh (every 30 minutes)
--
-- Prerequisites:
--   1. pg_cron extension enabled in postgresql.conf:
--        shared_preload_libraries = 'pg_cron'
--   2. Migration 063 and 064 must have been applied.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/post-deploy/005_schedule_analytics_refresh.sql
--
-- This script is idempotent: it unschedules any existing job with old names
-- before creating a new one, so it is safe to re-run.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT jobid 
        FROM cron.job 
        WHERE jobname IN ('refresh_analytics_mviews_hourly', 'refresh_analytics_mviews_recurring')
    ) LOOP
        PERFORM cron.unschedule(r.jobid);
    END LOOP;
END;
$$;

-- Schedule recurring every 30 minutes: '*/30 * * * *'
SELECT cron.schedule(
    'refresh_analytics_mviews_recurring',
    '*/30 * * * *',
    'CALL analytics.sp_refresh_analytics_mviews()'
);

-- Use Unix Domain Socket (/var/run/postgresql) and superuser 'postgres' to avoid TCP connection authentication failures
UPDATE cron.job 
SET nodename = '/var/run/postgresql', 
    username = 'postgres' 
WHERE jobname = 'refresh_analytics_mviews_recurring';
