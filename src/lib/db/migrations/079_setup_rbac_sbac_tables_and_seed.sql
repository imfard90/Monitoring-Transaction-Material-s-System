-- ============================================================================
-- Migration: 079_setup_rbac_sbac_tables_and_seed.sql
-- Description:
-- Fase 1 RBAC + SBAC (RSCA) — Additive-Only Database Foundation:
-- 1. Membuat tabel auth.roles, auth.permissions, auth.role_permissions,
--    dan auth.user_scopes dengan kepatuhan tipe data strict (VARCHAR(20) NIK,
--    SMALLINT hierarchy_level, TIMESTAMPTZ, CHECK constraints).
-- 2. Seeding 6 tingkatan role, 23 granular permissions, dan mapping role_permissions.
-- 3. Backfill idempoten user eksisting ke auth.user_scopes:
--    - Staff PIC gudang -> STAFF_GUDANG (sesuai mas_wh)
--    - Non-Staff -> PEJABAT_BRANCH (sesuai hr.employees -> hr.branches, fallback 'LAMONGAN')
-- ============================================================================

-- 1. Master Roles
CREATE TABLE IF NOT EXISTS auth.roles (
    id SERIAL PRIMARY KEY,
    role_key VARCHAR(50) UNIQUE NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    hierarchy_level SMALLINT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_auth_roles_hierarchy CHECK (hierarchy_level BETWEEN 1 AND 6)
);

-- 2. Master Permissions Granular
CREATE TABLE IF NOT EXISTS auth.permissions (
    id SERIAL PRIMARY KEY,
    permission_key VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT
);

-- 3. Pivot Role <-> Permission
CREATE TABLE IF NOT EXISTS auth.role_permissions (
    role_id INT NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 4. User Scopes (Sumber Kebenaran Utama Role + Batasan Wilayah)
CREATE TABLE IF NOT EXISTS auth.user_scopes (
    id BIGSERIAL PRIMARY KEY,
    user_nik VARCHAR(20) NOT NULL,
    role_id INT NOT NULL REFERENCES auth.roles(id) ON DELETE RESTRICT,

    -- Cakupan Teritorial (NULL = Wildcard ke level di bawahnya sesuai role)
    area VARCHAR(50),
    regional VARCHAR(50),
    branch VARCHAR(100),
    service_area VARCHAR(100),
    warehouse_id INT REFERENCES inventory.mas_wh(id) ON DELETE CASCADE,

    is_primary BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    created_by VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_user_scopes_valid_window
        CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_user_scopes_nik_active
    ON auth.user_scopes (user_nik, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_user_scopes_wh
    ON auth.user_scopes (warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_scopes_branch
    ON auth.user_scopes (regional, branch) WHERE branch IS NOT NULL;

-- 5. Seed 6 Persona Roles
INSERT INTO auth.roles (role_key, role_name, hierarchy_level, description)
VALUES
    ('PEJABAT_AREA', 'Pejabat Area', 1, 'VP / GM Area — Monitoring makro, approval PO Tier-3, transfer antar regional.'),
    ('PEJABAT_REGIONAL', 'Pejabat Regional', 2, 'Head / Manager Logistik Regional — Monitoring regional, approval PO Tier-2, transfer antar branch.'),
    ('PEJABAT_BRANCH', 'Pejabat Branch / District', 3, 'Branch Manager / Manager Logistik — Monitoring witel, approval Stock Opname & PO Tier-1.'),
    ('TL_SA', 'Pejabat Service Area', 4, 'Team Leader / Korlap Service Area — Verifikasi kebutuhan material & pemakaian lapangan.'),
    ('STAFF_GUDANG', 'Staff Gudang (PIC)', 5, 'PIC Material Gudang — Eksekusi Out SAP, InOut Tag, Rekon, Return, & input fisik Stock Opname.'),
    ('TEKNISI', 'Teknisi Lapangan', 6, 'Teknisi — Monitoring stok intech pribadi & pengajuan return material.')
ON CONFLICT (role_key) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    hierarchy_level = EXCLUDED.hierarchy_level,
    description = EXCLUDED.description;

-- 6. Seed Granular Permissions
INSERT INTO auth.permissions (permission_key, module, description)
VALUES
    ('dashboard:view', 'DASHBOARD', 'Melihat Dashboard Utama & KPI sesuai scope wilayah'),
    ('stock:view', 'STOCK', 'Melihat Stock Inventory, Intech, NTE, dan Live Stock'),
    ('out_sap:create', 'TRANSAKSI', 'Membuat transaksi pengeluaran material Out SAP'),
    ('rekon:create', 'TRANSAKSI', 'Melakukan rekonsiliasi Intech & Lensa'),
    ('rekon:unlock', 'TRANSAKSI', 'Mengedit atau rollback hasil rekonsiliasi'),
    ('return:create', 'TRANSAKSI', 'Mengajukan form Return Material / NTE'),
    ('return:approve', 'APPROVAL', 'Menyetujui atau menolak pengajuan Return Material / NTE'),
    ('stock_opname:input', 'TRANSAKSI', 'Menginput hasil fisik Stock Opname'),
    ('stock_opname:approve', 'APPROVAL', 'Menyetujui atau menolak selisih Stock Opname'),
    ('inout_tag:transfer', 'LOGISTIK', 'Mengirim dan menerima transfer material InOut Tag'),
    ('inout_tag:approve_branch', 'APPROVAL', 'Menyetujui transfer InOut Tag antar Service Area (dalam 1 Branch)'),
    ('inout_tag:approve_regional', 'APPROVAL', 'Menyetujui transfer InOut Tag antar Branch (dalam 1 Regional)'),
    ('inout_tag:approve_area', 'APPROVAL', 'Menyetujui transfer InOut Tag antar Regional (dalam 1 Area)'),
    ('po:create', 'PENGADAAN', 'Membuat pengajuan Purchase Order (Request PO)'),
    ('po:approve_tier1', 'APPROVAL', 'Verifikasi awal & approval PO Tier-1 (Branch)'),
    ('po:approve_tier2', 'APPROVAL', 'Approval PO Tier-2 (Regional)'),
    ('po:approve_tier3', 'APPROVAL', 'Final budget clearance PO Tier-3 (Area)'),
    ('reference:view', 'REFERENCE', 'Melihat data referensi K-Pro, Out Lensa, WO Lensa, Stock Comparison'),
    ('reference:sync', 'REFERENCE', 'Menjalankan trigger sinkronisasi / scrape manual Lensa & K-Pro'),
    ('users:view', 'MANAGEMENT', 'Melihat daftar pengguna'),
    ('users:manage', 'MANAGEMENT', 'Mengatur role, scope wilayah, aktivasi, dan approval API pengguna'),
    ('technicians:manage', 'MANAGEMENT', 'Mengelola master teknisi & mapping NTE'),
    ('policy:manage', 'MANAGEMENT', 'Mengelola Stock Policy & Master Gudang')
ON CONFLICT (permission_key) DO UPDATE SET
    module = EXCLUDED.module,
    description = EXCLUDED.description;

-- 7. Seed Role <-> Permissions Mapping
WITH role_perm_map(role_key, permission_key) AS (
    VALUES
        -- Level 1: PEJABAT_AREA
        ('PEJABAT_AREA', 'dashboard:view'),
        ('PEJABAT_AREA', 'stock:view'),
        ('PEJABAT_AREA', 'reference:view'),
        ('PEJABAT_AREA', 'stock_opname:approve'),
        ('PEJABAT_AREA', 'inout_tag:approve_area'),
        ('PEJABAT_AREA', 'po:approve_tier3'),
        ('PEJABAT_AREA', 'users:view'),
        ('PEJABAT_AREA', 'users:manage'),
        ('PEJABAT_AREA', 'policy:manage'),

        -- Level 2: PEJABAT_REGIONAL
        ('PEJABAT_REGIONAL', 'dashboard:view'),
        ('PEJABAT_REGIONAL', 'stock:view'),
        ('PEJABAT_REGIONAL', 'reference:view'),
        ('PEJABAT_REGIONAL', 'stock_opname:approve'),
        ('PEJABAT_REGIONAL', 'inout_tag:approve_regional'),
        ('PEJABAT_REGIONAL', 'po:approve_tier2'),
        ('PEJABAT_REGIONAL', 'users:view'),
        ('PEJABAT_REGIONAL', 'users:manage'),
        ('PEJABAT_REGIONAL', 'policy:manage'),

        -- Level 3: PEJABAT_BRANCH
        ('PEJABAT_BRANCH', 'dashboard:view'),
        ('PEJABAT_BRANCH', 'stock:view'),
        ('PEJABAT_BRANCH', 'reference:view'),
        ('PEJABAT_BRANCH', 'reference:sync'),
        ('PEJABAT_BRANCH', 'rekon:unlock'),
        ('PEJABAT_BRANCH', 'return:approve'),
        ('PEJABAT_BRANCH', 'stock_opname:approve'),
        ('PEJABAT_BRANCH', 'inout_tag:approve_branch'),
        ('PEJABAT_BRANCH', 'po:approve_tier1'),
        ('PEJABAT_BRANCH', 'users:view'),
        ('PEJABAT_BRANCH', 'technicians:manage'),
        ('PEJABAT_BRANCH', 'policy:manage'),

        -- Level 4: TL_SA
        ('TL_SA', 'dashboard:view'),
        ('TL_SA', 'stock:view'),
        ('TL_SA', 'reference:view'),
        ('TL_SA', 'return:approve'),
        ('TL_SA', 'technicians:manage'),

        -- Level 5: STAFF_GUDANG
        ('STAFF_GUDANG', 'dashboard:view'),
        ('STAFF_GUDANG', 'stock:view'),
        ('STAFF_GUDANG', 'out_sap:create'),
        ('STAFF_GUDANG', 'rekon:create'),
        ('STAFF_GUDANG', 'return:create'),
        ('STAFF_GUDANG', 'return:approve'),
        ('STAFF_GUDANG', 'stock_opname:input'),
        ('STAFF_GUDANG', 'inout_tag:transfer'),
        ('STAFF_GUDANG', 'po:create'),
        ('STAFF_GUDANG', 'reference:view'),
        ('STAFF_GUDANG', 'reference:sync'),

        -- Level 6: TEKNISI
        ('TEKNISI', 'dashboard:view'),
        ('TEKNISI', 'stock:view'),
        ('TEKNISI', 'return:create')
)
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_perm_map m
JOIN auth.roles r ON r.role_key = m.role_key
JOIN auth.permissions p ON p.permission_key = m.permission_key
ON CONFLICT DO NOTHING;

-- 8. Idempotent Backfill User Eksisting ke auth.user_scopes
-- 8.1 Staff Gudang berdasarkan mas_wh.pic_1 / pic_2
INSERT INTO auth.user_scopes (
    user_nik,
    role_id,
    area,
    regional,
    branch,
    warehouse_id,
    is_primary,
    created_by
)
SELECT DISTINCT
    u.nik,
    r.id,
    COALESCE(b.area, 'JAWA BALI'),
    COALESCE(b.regional, 'JATIM'),
    COALESCE(w.branch, 'LAMONGAN'),
    w.id,
    TRUE,
    'migration_079'
FROM auth."user" u
JOIN inventory.mas_wh w ON w.pic_1 = u.nik OR w.pic_2 = u.nik
JOIN auth.roles r ON r.role_key = 'STAFF_GUDANG'
LEFT JOIN LATERAL (
    SELECT area, regional
    FROM hr.branches br
    WHERE UPPER(TRIM(br.branch)) = UPPER(TRIM(w.branch))
    LIMIT 1
) b ON TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM auth.user_scopes us
    WHERE us.user_nik = u.nik AND us.warehouse_id = w.id
);

-- 8.2 Non-Staff Eksisting -> PEJABAT_BRANCH (default dari hr.employees -> hr.branches, fallback LAMONGAN)
INSERT INTO auth.user_scopes (
    user_nik,
    role_id,
    area,
    regional,
    branch,
    is_primary,
    created_by
)
SELECT
    u.nik,
    r.id,
    COALESCE(br.area, 'JAWA BALI'),
    COALESCE(br.regional, 'JATIM'),
    COALESCE(br.branch, 'LAMONGAN'),
    TRUE,
    'migration_079'
FROM auth."user" u
JOIN auth.roles r ON r.role_key = 'PEJABAT_BRANCH'
LEFT JOIN hr.employees e ON e.nik = u.nik
LEFT JOIN hr.branches br ON br.id = e.branch_id
LEFT JOIN hr.levels l ON l.id = e.level_id
WHERE COALESCE(l.level_name, '') <> 'Staff'
  AND NOT EXISTS (
      SELECT 1 FROM inventory.mas_wh w WHERE w.pic_1 = u.nik OR w.pic_2 = u.nik
  )
  AND NOT EXISTS (
      SELECT 1 FROM auth.user_scopes us WHERE us.user_nik = u.nik
  );
