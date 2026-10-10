-- 014_add_dashboard_indexes.sql
-- P2 audit fix: Add indexes for dashboard query performance
-- Covers: warehouse_id, end_status, request_time, created_at on header tables

-- inout_tag_header: warehouse + status + time lookups
CREATE INDEX IF NOT EXISTS idx_inout_tag_header_from_wh_id
    ON inventory.inout_tag_header (from_wh_id);
CREATE INDEX IF NOT EXISTS idx_inout_tag_header_to_wh_id
    ON inventory.inout_tag_header (to_wh_id);
CREATE INDEX IF NOT EXISTS idx_inout_tag_header_end_status
    ON inventory.inout_tag_header (end_status);
CREATE INDEX IF NOT EXISTS idx_inout_tag_header_request_time
    ON inventory.inout_tag_header (request_time DESC);

-- sap_out_header: warehouse + status + time lookups
CREATE INDEX IF NOT EXISTS idx_sap_out_header_warehouse_id
    ON inventory.sap_out_header (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sap_out_header_end_status
    ON inventory.sap_out_header (end_status);
CREATE INDEX IF NOT EXISTS idx_sap_out_header_request_time
    ON inventory.sap_out_header (request_time DESC);

-- transaction_used_header: warehouse (via sap_out) + time
CREATE INDEX IF NOT EXISTS idx_transaction_used_header_created_at
    ON inventory.transaction_used_header (created_at DESC);

-- transaction_used_item: created_at for hasil-rekon range queries
CREATE INDEX IF NOT EXISTS idx_transaction_used_item_created_at
    ON inventory.transaction_used_item (created_at DESC);

-- return_material_header: warehouse + status + time
CREATE INDEX IF NOT EXISTS idx_return_material_header_warehouse_id
    ON inventory.return_material_header (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_return_material_header_end_status
    ON inventory.return_material_header (end_status);
CREATE INDEX IF NOT EXISTS idx_return_material_header_created_at
    ON inventory.return_material_header (created_at DESC);

-- rekon_used_header: time range queries
CREATE INDEX IF NOT EXISTS idx_rekon_used_header_create_at
    ON inventory.rekon_used_header (create_at DESC);

-- wo_lensa_header: wo_number lookup (D3 fix - exact match index)
CREATE INDEX IF NOT EXISTS idx_wo_lensa_header_wo_number
    ON inventory.wo_lensa_header (wo_number);
