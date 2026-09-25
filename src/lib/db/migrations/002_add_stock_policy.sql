-- Migration: Create stock_policy table and calculation stored procedure

CREATE TABLE IF NOT EXISTS inventory.stock_policy (
    id BIGSERIAL PRIMARY KEY,
    warehouse_id BIGINT NOT NULL,
    designator_id BIGINT NOT NULL,
    min_qty INT NOT NULL DEFAULT 0,
    max_qty INT NOT NULL DEFAULT 0,
    average_demand_weekly NUMERIC(10,2) DEFAULT 0,
    lead_time_weeks INT NOT NULL DEFAULT 2,
    safety_stock_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (warehouse_id, designator_id)
);

CREATE OR REPLACE PROCEDURE inventory.sp_calculate_stock_policy(
    p_warehouse_id BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_lead_time INT := 2;
    v_safety_pct NUMERIC := 10.00;
BEGIN
    -- Upsert into stock_policy for all materials present in stock_balance for this warehouse
    INSERT INTO inventory.stock_policy (
        warehouse_id, designator_id, min_qty, average_demand_weekly, lead_time_weeks, safety_stock_pct, updated_at
    )
    SELECT 
        sb.warehouse_id,
        sb.designator_id,
        -- Rumus: (Avg Demand * Lead Time) + 10% Safety Stock
        CEIL(((COALESCE(SUM(ABS(sm.qty_delta)), 0) / 4.0) * v_lead_time) * (1 + (v_safety_pct / 100.0))) as calc_min_qty,
        -- Avg Demand = Total pengeluaran 28 hari (4 minggu) dibagi 4
        COALESCE(SUM(ABS(sm.qty_delta)), 0) / 4.0 as calc_avg,
        v_lead_time,
        v_safety_pct,
        CURRENT_TIMESTAMP
    FROM inventory.stock_balance sb
    LEFT JOIN inventory.stock_movement sm 
           ON sm.warehouse_id = sb.warehouse_id 
          AND sm.designator_id = sb.designator_id
          AND sm.movement_type IN ('sap_out', 'transfer_out')
          AND sm.created_at >= CURRENT_DATE - INTERVAL '28 days'
    WHERE sb.warehouse_id = p_warehouse_id
    GROUP BY sb.warehouse_id, sb.designator_id
    ON CONFLICT (warehouse_id, designator_id) DO UPDATE SET
        min_qty = EXCLUDED.min_qty,
        average_demand_weekly = EXCLUDED.average_demand_weekly,
        updated_at = CURRENT_TIMESTAMP;
END;
$$;
