-- Migration: Stock Opname Log
-- Created: 2026-10-21
-- Description: Single record log dengan JSON detail untuk stock opname

CREATE TABLE IF NOT EXISTS inventory.stock_opname_log (
  id SERIAL PRIMARY KEY,
  warehouse_id INT NOT NULL REFERENCES inventory.mas_wh(id),
  warehouse_name VARCHAR(100) NOT NULL,
  
  -- JSON detail: [{ material_code, material_name, qty_system, qty_opname, difference }]
  details JSONB NOT NULL,
  
  total_items INT NOT NULL,
  total_difference INT NOT NULL, -- sum of abs(difference)
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approval_reason TEXT,
  approved_by VARCHAR(20), -- NIK
  approved_at TIMESTAMPTZ,
  
  created_by VARCHAR(20) NOT NULL, -- NIK
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_opname_log_warehouse ON inventory.stock_opname_log(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_log_status ON inventory.stock_opname_log(status);
CREATE INDEX IF NOT EXISTS idx_stock_opname_log_created ON inventory.stock_opname_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_opname_log_details_gin ON inventory.stock_opname_log USING gin(details);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION inventory.update_stock_opname_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_opname_log_updated_at ON inventory.stock_opname_log;
CREATE TRIGGER trg_stock_opname_log_updated_at
BEFORE UPDATE ON inventory.stock_opname_log
FOR EACH ROW
EXECUTE FUNCTION inventory.update_stock_opname_log_timestamp();

COMMENT ON TABLE inventory.stock_opname_log IS 'Log stock opname dengan detail material dalam format JSON';
COMMENT ON COLUMN inventory.stock_opname_log.details IS 'Array JSON berisi detail per material: [{ material_code, material_name, qty_system, qty_opname, difference }]';
COMMENT ON COLUMN inventory.stock_opname_log.status IS 'Status approval: pending (default), approved (final), rejected (final)';
