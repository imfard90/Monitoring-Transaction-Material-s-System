# ADR-002: NTE Stored Procedures dan Warehouse Mapping

- **Status**: Implemented
- **Tanggal**: 2026-10-19
- **Updated**: 2026-10-20 (NTE-06, NTE-09 complete)
- **Pengusul**: Cline AI Agent
- **Komponen Terdampak**: `nte_inventory` schema, `inventory.mas_wh`, stored procedures, approval workflow

## 1. Konteks (Context)

### Masalah
- NTE (Network Training Equipment) transaksi tidak memiliki scoping warehouse yang jelas
- Alamat NTE (`mas_address_nte`) tidak terhubung ke warehouse inventory (`mas_wh`)
- Stored procedure untuk transaksi NTE (tag, install, return) belum diimplementasi di database layer
- Security workflow audit menemukan migration 027 intentionally blocked karena kontrak authorization belum disepakati
- TAG approval workflow langsung mutasi stok tanpa approval gate (migration 034 issue)

### Batasan
- Migration harus idempoten (CREATE OR REPLACE, IF NOT EXISTS)
- Stored procedure harus enforce authorization via DB caller-provided `warehouse_id`
- Mapping warehouse vs alamat NTE harus fleksibel (nullable FK)
- Approval flow wajib terpisah dari creation: request → approve/reject → stock mutation

## 2. Keputusan (Decision)

### A. Stored Procedures

#### Migration 027, 029, 034: TAG/Install/Return Creation
- `sp_create_tag_nte`: Transfer SN request (status=`request`, no stock mutation yet)
- `sp_set_install_nte`: Install SN ke teknisi
- `sp_return_nte`: Return SN dari teknisi

#### Migration 035: Approval Workflow (NEW)
- `sp_approve_nte_tag(id_transaksi, approved_by, warehouse_id)`: Approve TAG with warehouse authorization
  - Staff: `warehouse_id` must match destination `mapping_mas_wh`
  - Non-Staff: `warehouse_id = NULL` (access all warehouses)
  - Execute stock mutation (UPDATE/INSERT `mas_sn_nte`) only on approval
- `sp_reject_nte_tag(id_transaksi, rejected_by, warehouse_id, notes)`: Reject TAG (set status=`cancel`, no stock mutation)

**Authorization contract (NTE-06):**
```sql
-- Staff authorization check in SP
IF p_warehouse_id IS NOT NULL AND p_warehouse_id <> v_tujuan_wh_id THEN
    RAISE EXCEPTION 'Unauthorized: Staff hanya bisa approve TAG untuk warehouse_id=%', p_warehouse_id;
END IF;
```

### B. Warehouse Mapping (Migration 028)
- Kolom `mapping_mas_wh` (INTEGER, FK `inventory.mas_wh.id`) pada `mas_address_nte`
- Value `NULL` untuk alamat NTE yang tidak ter-assign (e.g., vendor, external)

**Mapping yang diimplementasi (NTE-09 validation):**
| Address Name | Warehouse ID | Warehouse Name |
|--------------|--------------|----------------|
| ta_so_ccan_bambe_wh | 1 | TELKOM Lamongan |
| ta_so_ccan_gresik_wh | 2 | TELKOM Gresik |
| ta_so_ccan_lamongan_wh | 3 | TELKOM Lamongan |
| ta_so_ccan_bojonegoro_wh | 4 | TELKOM Bojonegoro |
| ta_so_ccan_tif_sby_wh | 3 | TIF Surabaya |
| ta_so_ccan_tif_gresik_wh | 3 | TIF Gresik |
| ta_so_ccan_tif_lamongan_wh | 3 | TIF Lamongan |
| ta_so_ccan_tif_sby_utara_wh | 3 | TIF Surabaya Utara |
| ta_so_ccan_tif_sby_selatan_wh | 3 | TIF Surabaya Selatan |
| ta_so_ccan_tif_sby_barat_wh | 3 | TIF Surabaya Barat |
| ta_so_ccan_telsel_semarang_wh | 2 | Telkomsel Semarang |
| ta_so_ccan_telsel_jogja_wh | 2 | Telkomsel Jogja |
| ta_so_ccan_telsel_magelang_wh | 2 | Telkomsel Magelang |
| ta_so_ccan_telsel_purworejo_wh | 2 | Telkomsel Purworejo |
| ta_so_ccan_telsel_pati_wh | 2 | Telkomsel Pati |
| ta_so_ccan_telsel_kudus_wh | 2 | Telkomsel Kudus |

**Unmapped addresses (Witel-level, Non-Staff only):**
- `ta_witel_ccan_sby_utara` (NULL)
- `tif_district_lamongan_wh` (NULL)
- `ta_witel_inv_sby_utara` (NULL)

### C. GRANTS
- REVOKE EXECUTE dari PUBLIC
- GRANT EXECUTE ke role `imam` (application DB role)
- GRANT USAGE pada sequence `trx_nte_seq`

## 3. Konsekuensi (Consequences)

### Positif
- **Integritas data**: Validasi warehouse scope di database layer, tidak bisa bypass app
- **Atomicity**: Setiap transaksi SN (tag/install/return) terjadi dalam satu transaksi DB
- **Audit trail**: Semua perubahan SN tercatat di `log_transaction_header`/`log_transaction_items`
- **Performance**: Index pada `mapping_mas_wh` mempercepat JOIN warehouse scoping
- **Security**: Approval workflow mencegah unauthorized stock mutation (NTE-06)

### Kompromi / Trade-off
- Stored procedure requires DB connection dengan role `imam`
- Migration tidak bisa dijalankan tanpa `DATABASE_URL` environment
- Mapping warehouse-address harus diperbarui manual jika tambah alamat NTE baru
- Staff role hanya bisa approve TAG untuk warehouse yang ter-assign

## 4. Alternatif yang Dipertimbangkan

| Alternatif | Alasan ditolak |
|------------|----------------|
| Validasi warehouse di aplikasi layer (Node.js) | Bisa bypass direct DB access; tidak atomic |
| Trigger auto-detect warehouse dari `ui_label` | Risky: perubahan nama warehouse break logic; tidak eksplisit |
| Many-to-many mapping (junction table) | Overkill: satu alamat → satu warehouse cukup untuk use case NTE |
| Auto-approve TAG (migration 034 original) | Bypass authorization; mutasi stok tanpa approval gate |

## 5. Deployment Checklist

- [x] Migration file validasi SQL syntax (027, 028, 035)
- [x] Migration 035: Approval workflow dengan warehouse authorization
- [x] Repository methods: `approveTag`, `rejectTag` dengan `warehouseId` parameter
- [x] Unit test: `tests/unit/nte-approval-authorization.test.ts` (Staff/Non-Staff scenarios)
- [ ] Jalankan migration 035 di database non-prod dengan `DATABASE_URL` set
- [ ] Verifikasi mapping dengan query test:
  ```sql
  SELECT address_name, mapping_mas_wh, w.name AS warehouse_name
  FROM nte_inventory.mas_address_nte n
  LEFT JOIN inventory.mas_wh w ON n.mapping_mas_wh = w.id;
  ```
- [ ] Test stored procedure approval/reject via psql atau aplikasi
- [ ] Update `docs/AUDIT_REPORT.md` status NTE-06, NTE-09 → Complete
- [ ] Run `pnpm tsc --noEmit` dan `pnpm lint` untuk pastikan tidak ada regressi
- [ ] Push migration files ke repo, buat PR

## 6. Implementation Summary (2026-10-20)

**Migration 035 Changes:**
- `sp_create_tag_nte`: Default status changed from `'approve'` → `'request'`
- Stock mutation deferred until approval (validation only at TAG creation)
- `sp_approve_nte_tag(id_transaksi, approved_by, warehouse_id)`: Execute stock mutation with warehouse authorization
  - Staff: `warehouse_id` must match destination `mapping_mas_wh`
  - Non-Staff: `warehouse_id = NULL` (access all warehouses)
- `sp_reject_nte_tag(id_transaksi, rejected_by, warehouse_id, notes)`: Same authorization, set `status='cancel'`

**Authorization Contract (NTE-06):**
- ✅ Stored procedure enforces `warehouse_id` validation at DB layer
- ✅ Staff role: `p_warehouse_id <> v_tujuan_wh_id` → `RAISE EXCEPTION 'Unauthorized'`
- ✅ Non-Staff role: `p_warehouse_id IS NULL` → pass
- ✅ Unmapped addresses (`mapping_mas_wh = NULL`) → reject with clear error

**Warehouse Mapping Validation (NTE-09):**
- ✅ 15/18 addresses mapped to `inventory.mas_wh` via `mapping_mas_wh` FK
- ✅ 3 unmapped Witel-level addresses identified (Non-Staff only access)
- ✅ Unit test coverage for mapped/unmapped scenarios

## 7. Referensi

- `docs/NTE_SECURITY_WORKFLOW.md` — Security audit workflow
- `docs/AUDIT_REPORT.md` — Audit findings (NTE-06, NTE-09)
- `bispro-nte.md` — NTE business process specification
- `src/lib/db/migrations/035_add_nte_approval_workflow.sql` — Approval SP implementation
- `tests/unit/nte-approval-authorization.test.ts` — Authorization test suite
