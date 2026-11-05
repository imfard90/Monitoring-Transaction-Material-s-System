-- Migration 053: Create inventory.stock_policy_log and update sp_calculate_stock_policy_nightly with audit logging
-- Rollback:
--   DROP TABLE IF EXISTS inventory.stock_policy_log;
--   Restore original sp_calculate_stock_policy_nightly without audit logging.

CREATE TABLE IF NOT EXISTS inventory.stock_policy_log (
    id BIGSERIAL PRIMARY KEY,
    trigger_type VARCHAR(20) DEFAULT 'system' NOT NULL, -- 'system' (cron) or 'manual'
    status VARCHAR(20) DEFAULT 'success' NOT NULL,        -- 'success' or 'failed'
    warehouses_processed INT DEFAULT 0 NOT NULL,
    duration_ms INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_policy_log_created_at 
ON inventory.stock_policy_log (created_at DESC);

ALTER TABLE inventory.stock_policy_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_policy_log_select_policy ON inventory.stock_policy_log;
CREATE POLICY stock_policy_log_select_policy ON inventory.stock_policy_log
    FOR SELECT USING (true);

DROP POLICY IF EXISTS stock_policy_log_insert_policy ON inventory.stock_policy_log;
CREATE POLICY stock_policy_log_insert_policy ON inventory.stock_policy_log
    FOR INSERT WITH CHECK (true);

COMMENT ON TABLE inventory.stock_policy_log IS 'Riwayat eksekusi kalkulasi stock policy (cron 2-jam atau manual trigger)';
COMMENT ON COLUMN inventory.stock_policy_log.trigger_type IS 'Tipe pemicu: system (cron) atau manual (admin action)';
COMMENT ON COLUMN inventory.stock_policy_log.status IS 'Status eksekusi: success atau failed';
COMMENT ON COLUMN inventory.stock_policy_log.warehouses_processed IS 'Jumlah gudang yang berhasil diproses kalkulasi';
COMMENT ON COLUMN inventory.stock_policy_log.duration_ms IS 'Lama waktu eksekusi dalam milidetik';
COMMENT ON COLUMN inventory.stock_policy_log.error_message IS 'Pesan error jika status failed';
COMMENT ON COLUMN inventory.stock_policy_log.created_at IS 'Waktu eksekusi selesai';

-- Update procedure to log execution into inventory.stock_policy_log
CREATE OR REPLACE PROCEDURE inventory.sp_calculate_stock_policy_nightly()
LANGUAGE plpgsql
AS $$
DECLARE
    v_wh RECORD;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_wh_count INT := 0;
BEGIN
    FOR v_wh IN SELECT id FROM inventory.mas_wh
    LOOP
        CALL inventory.sp_calculate_stock_policy(v_wh.id);
        v_wh_count := v_wh_count + 1;
    END LOOP;

    INSERT INTO inventory.stock_policy_log (
        trigger_type,
        status,
        warehouses_processed,
        duration_ms,
        created_at
    ) VALUES (
        'system',
        'success',
        v_wh_count,
        ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000),
        CURRENT_TIMESTAMP
    );
EXCEPTION WHEN OTHERS THEN
    INSERT INTO inventory.stock_policy_log (
        trigger_type,
        status,
        warehouses_processed,
        duration_ms,
        error_message,
        created_at
    ) VALUES (
        'system',
        'failed',
        v_wh_count,
        ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000),
        SQLERRM,
        CURRENT_TIMESTAMP
    );
    RAISE;
END;
$$;

