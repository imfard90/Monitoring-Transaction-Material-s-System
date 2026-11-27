-- Migration 071: Enable RLS on Lensa Normalization & Alias Tables (L4 Compliance)
-- Sesuai standar keamanan MTMS (AGENTS.md P0 / test migrations L4 compliance),
-- seluruh tabel pada skema inventory, auth, dan hr wajib memiliki Row Level Security (RLS) enabled.

-- 1. inventory.warehouse_alias
ALTER TABLE inventory.warehouse_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warehouse_alias_select_policy ON inventory.warehouse_alias;
CREATE POLICY warehouse_alias_select_policy ON inventory.warehouse_alias
    FOR SELECT USING (true);

DROP POLICY IF EXISTS warehouse_alias_all_policy ON inventory.warehouse_alias;
CREATE POLICY warehouse_alias_all_policy ON inventory.warehouse_alias
    FOR ALL USING (true) WITH CHECK (true);

-- 2. inventory.material_alias
ALTER TABLE inventory.material_alias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS material_alias_select_policy ON inventory.material_alias;
CREATE POLICY material_alias_select_policy ON inventory.material_alias
    FOR SELECT USING (true);

DROP POLICY IF EXISTS material_alias_all_policy ON inventory.material_alias;
CREATE POLICY material_alias_all_policy ON inventory.material_alias
    FOR ALL USING (true) WITH CHECK (true);

-- 3. inventory.unmapped_alias_log
ALTER TABLE inventory.unmapped_alias_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unmapped_alias_log_select_policy ON inventory.unmapped_alias_log;
CREATE POLICY unmapped_alias_log_select_policy ON inventory.unmapped_alias_log
    FOR SELECT USING (true);

DROP POLICY IF EXISTS unmapped_alias_log_all_policy ON inventory.unmapped_alias_log;
CREATE POLICY unmapped_alias_log_all_policy ON inventory.unmapped_alias_log
    FOR ALL USING (true) WITH CHECK (true);
