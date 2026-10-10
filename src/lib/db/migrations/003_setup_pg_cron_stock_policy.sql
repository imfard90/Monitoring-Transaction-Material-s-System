-- Migration: Setup pg_cron for nightly stock policy recalculation
--
-- Prerequisite: postgresql.conf must have:
--   shared_preload_libraries = 'pg_cron'
-- The extension creation will fail if pg_cron is not preloaded.
-- If your environment does not support pg_cron, this migration will fail;
-- run the post-deploy script `scripts/post-deploy/003_schedule_pg_cron.sql`
-- manually after confirming pg_cron is available.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE PROCEDURE inventory.sp_calculate_stock_policy_nightly()
LANGUAGE plpgsql
AS $$
DECLARE
    v_wh RECORD;
BEGIN
    FOR v_wh IN SELECT id FROM inventory.mas_wh
    LOOP
        CALL inventory.sp_calculate_stock_policy(v_wh.id);
    END LOOP;
END;
$$;

-- NOTE: The cron.schedule() call has been moved to a separate post-deploy
-- script (scripts/post-deploy/003_schedule_pg_cron.sql) so that migration
-- does not fail in environments where pg_cron is unavailable.
-- Run that script manually after confirming pg_cron is active.
