-- Migration: exclude transfer_out from stock policy consumption demand.
-- Transfer movements still update stock_balance; they are not material consumption.
-- Rollback: restore the prior movement_type IN ('sap_out', 'transfer_out') filter
-- in inventory.sp_calculate_stock_policy and recalculate all warehouse policies.

CREATE OR REPLACE PROCEDURE inventory.sp_calculate_stock_policy(
    p_warehouse_id BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_lead_time INT := 2;
    v_safety_pct NUMERIC := 10.00;
BEGIN
    INSERT INTO inventory.stock_policy (
        warehouse_id, designator_id, min_qty, average_demand_weekly,
        lead_time_weeks, safety_stock_pct, updated_at
    )
    SELECT
        sb.warehouse_id,
        sb.designator_id,
        CEIL(((COALESCE(SUM(ABS(sm.qty_delta)), 0) / 12.0) * v_lead_time)
            * (1 + (v_safety_pct / 100.0))) AS calc_min_qty,
        COALESCE(SUM(ABS(sm.qty_delta)), 0) / 12.0 AS calc_avg,
        v_lead_time,
        v_safety_pct,
        CURRENT_TIMESTAMP
    FROM inventory.stock_balance AS sb
    LEFT JOIN inventory.stock_movement AS sm
        ON sm.warehouse_id = sb.warehouse_id
       AND sm.designator_id = sb.designator_id
       AND sm.movement_type = 'sap_out'
       AND sm.created_at >= CURRENT_DATE - INTERVAL '84 days'
    WHERE sb.warehouse_id = p_warehouse_id
    GROUP BY sb.warehouse_id, sb.designator_id
    ON CONFLICT (warehouse_id, designator_id) DO UPDATE SET
        min_qty = EXCLUDED.min_qty,
        average_demand_weekly = EXCLUDED.average_demand_weekly,
        updated_at = CURRENT_TIMESTAMP;
END;
$$;
