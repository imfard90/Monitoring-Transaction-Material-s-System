-- Migration: Setup pg_cron for nightly stock policy recalculation

-- Note: This requires the pg_cron extension to be enabled in postgresql.conf
-- (shared_preload_libraries = 'pg_cron')
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

-- Menjadwalkan cron job untuk jam 01:00 pagi (Waktu server DB)
-- Format cron: '0 1 * * *' (menit 0, jam 1 setiap hari)
SELECT cron.schedule('calculate_stock_policy_nightly', '0 1 * * *', 'CALL inventory.sp_calculate_stock_policy_nightly()');
