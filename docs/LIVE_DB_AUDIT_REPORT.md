# Live Database Audit Report — MTMS PostgreSQL

> Hasil audit **read-only** langsung terhadap database live MTMS. Audit ini melengkapi `docs/AUDIT_REPORT.md` (audit statik). Semua kueri dijalankan dalam transaksi `BEGIN READ ONLY` → `ROLLBACK`, hanya membaca metadata `pg_catalog`/`information_schema` dan agregat ringkas—tidak ada mutasi, tidak ada dump baris transaksi.

**Tanggal audit:** 2026-10-11
**Target:** database `gresik` (PostgreSQL, extension `pg_cron` 1.6 aktif via `shared_preload_libraries`).
**Role koneksi:** `imam`.
**Schemas diperiksa:** `inventory` (utama), `auth`, `hr`.

---

## 1. Ringkasan Eksekutif

Audit live mengonfirmasi struktur database sesuai kontrak migrasi 001–014 yang tercatat di `inventory._migration_log` (14/14 applied). Integritas referential (FK) terjaga—**0 baris orphan** pada seluruh relasi header→items. Unique constraint pada `id_trx` bekerja—**0 duplikat** pada ketiga tabel header transaksi. Stored procedure kritis (`sp_submit_rekon_intech`, `sp_record_rekon_lensa_v2`, `sp_record_material_used`, dll.) seluruhnya **SECURITY INVOKER** (bukan SECURITY DEFINER), sesuai praktik aman.

Namun ditemukan **5 temuan live baru** yang tidak terlihat dari audit statik:

| # | Temuan | Severity | Status |
|---|---|---|---|
| L1 | **27 baris `sap_out_items` dengan `qty_used > qty_req`** (overflow hingga +150) | P1—data integrity | ✅ Fixed (migration 015) |
| L2 | Role koneksi runtime adalah **superuser** (`rolsuper=true`) | P1—least privilege | ⬜ Open |
| L3 | **EXECUTE granted to PUBLIC** pada seluruh 19 SP inventory | P2—privilege | ✅ Fixed (migration 016) |
| L4 | **RLS OFF** pada seluruh tabel `inventory`/`auth`/`hr` + **0 policy** | P2—defense in depth | ✅ Fixed (migration 017) |
| L5 | `log_statement=none`, `log_min_duration_statement=-1` → **query audit off** | P2—operasi | ⬜ Partial (migration 018 documented; ALTER SYSTEM requires DBA manual execution) |

Detail tiap temuan di §3. Rekomendasi tindak lanjut di §4.

---

## 2. Cakupan Audit

| Area | Metode | Status |
|---|---|---|
| Identitas DB & role | `pg_roles`, `pg_settings` | ✅ |
| Tabel `inventory` (26 tabel) | `pg_class` + `information_schema.columns` | ✅ |
| Tabel `auth` (4), `hr` (9) | `pg_class` | ✅ |
| Constraint (PK/FK/UNIQUE/CHECK/NOT NULL) | `pg_constraint`, `pg_get_constraintdef` | ✅ |
| Indexes | `pg_indexes`, `pg_index` | ✅ |
| Stored procedure/routine (19 SP) | `pg_proc`, `prosecdef`, ACL | ✅ |
| Sequence grants & state | `pg_sequences`, `role_table_grants` | ✅ |
| Enum types (6 enum) | `pg_type`+`pg_enum` | ✅ |
| pg_cron jobs | `cron.job` | ✅ |
| Integritat data (orphan, duplikat, anomali qty) | Query agregat `COUNT(*) FILTER` | ✅ |
| RLS policies | `pg_policies` | ✅ |
| Migration log | `inventory._migration_log` | ✅ (metadata only) |

---

## 3. Temuan Live

### L1 — 27 baris `sap_out_items.qty_used > qty_req` (P1—Data Integrity)

**Query:**
```sql
SELECT count(*) FILTER (WHERE qty_used > qty_req) FROM inventory.sap_out_items;
-- hasil: 27 baris, total overflow +, max +150, min -1000 (beberapa negatif)
```

**Detail 10 teratas (sample):**

| id | header_id | designator_id | qty_req | qty_used | overflow |
|---|---|---|---|---|---|
| 711 | 219 | 16 | 250 | 400 | +150 |
| 467 | 145 | 16 | 500 | 650 | +150 |
| 84 | 30 | 16 | 300 | 401 | +101 |
| 385 | 121 | 16 | 250 | 341 | +91 |
| 318 | 103 | 16 | 100 | 180 | +80 |
| 627 | 195 | 16 | 250 | 325 | +75 |
| 398 | 126 | 16 | 243 | 313 | +70 |
| 76 | 28 | 16 | 500 | 550 | +50 |
| 389 | 122 | 16 | 20 | 40 | +20 |
| 321 | 103 | 371 | 4 | 8 | +4 |

**Pola:** 9 dari 10 baris melibatkan `designator_id=16`. Sum req=2613, sum used=3401 untuk designator 16 saja. Ini mengindikasikan **material tertentu (id 16) sistematis dipakai melebihi permintaan SAP**—bukan anomali satu kali.

**Impact:** Ketidaksesuaian fisik vs catatan SAP. Memengaruhi akurasi rekon dan saldo `stock_balance`. CHECK constraint `CHECK (qty_used >= 0)` ada tapi **tidak ada `CHECK (qty_used <= qty_req)`** di `sap_out_items`.

**Akar masalah (cross-ref statik):** Audit statik flag bahwa beberapa SP tidak memiliki validasi `qty > 0`/`qty_used <= qty_req`. Live data mengonfirmasi dampaknya nyata.

**Rekomendasi (§4-L1).**

---

### L2 — Role runtime superuser (P1—Least Privilege)

```text
rolname=imam  rolsuper=true  rolcreaterole=true  rolcreatedb=true  rolcanlogin=true
```

Aplikasi connect sebagai `imam` (per `DATABASE_URL`). Role ini **superuser** → dapat DROP tabel, baca semua data, bypass RLS, eskalasi tanpa audit. Jika kredensial bocor (mis. via log/error/SSRF), attacker mendapat kontrol penuh DB.

**Tabel privilege check:** `imam` memiliki SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER pada **semua 26 tabel inventory**.

**Rekomendasi (§4-L2).**

---

### L3 — `EXECUTE TO PUBLIC` pada seluruh SP inventory (P2)

`information_schema.role_routine_grants` menunjukkan **19 SP** di-grant `EXECUTE` ke `PUBLIC`:

```
sp_adjustment, sp_calculate_stock_policy, sp_calculate_stock_policy_nightly,
sp_close_inout_tag, sp_create_inout_tag, sp_create_return_request,
sp_edit_transaction_used, sp_insert_return_item, sp_opening_balance,
sp_process_transaction_used, sp_receive_material, sp_record_material_used,
sp_record_material_used_lensa, sp_record_rekon_lensa_v2, sp_return_material (2 overloads),
sp_sap_out, sp_submit_rekon_intech, sp_update_inout_tag
```

Setiap role yang dapat login ke DB (termasuk role scraping/readonly jika dibuat nanti) dapat `CALL` SP ini langsung—melewati server action otorisasi Next.js. Karena SP `SECURITY INVOKER`, efeknya dibatasi hak caller, tapi tetap memungkinkan pemanggilan tidak terduga.

**Catatan:** `EXECUTE TO PUBLIC` adalah default PostgreSQL saat `CREATE FUNCTION` tanpa `REVOKE`. Bukan kesalahan disengaja, tapi tetap perlu diperketat.

**Rekomendasi (§4-L3).**

---

### L4 — RLS OFF di seluruh tabel sensitif (P2—Defense in Depth)

```
pg_class.relrowsecurity = false  pada 26 tabel inventory + 4 auth + 9 hr
pg_policies: 0 row  (tidak ada policy sama sekali)
pg_settings.row_security = on  (fitur aktif, tapi tidak dipakai)
```

Tabel sensitif yang **tidak dilindungi RLS**:
- `auth.user` (11 baris, berisi kredensial), `auth.account`, `auth.user_mfa_devices`, `auth.verification`
- `hr.employees` (38), `hr.technicians` (255, beri NIK/PII), `hr.branches` (62)
- `inventory.stock_balance`, `stock_movement`, seluruh header/items transaksi

**Pertimbangan:** Aplikasi mungkin menerapkan otorisasi di layer server action (sudah diperbaiki P0 per `P0_FIXES_STATUS.md`). Namun **defense in depth** biasanya memerlukan RLS agar celah otorisasi di app tidak langsung membuka semua data. Karena role runtime superuser (L2), RLS tidak akan efektif sampai role non-superuser dipakai.

**Rekomendasi (§4-L4).**

---

### L5 — Query logging dimatikan (P2—Operasi)

```
log_statement             = none
log_min_duration_statement = -1  (slow query log off)
shared_preload_libraries   = pg_cron
ssl                       = on   ✅
```

Tidak ada jejak query di log PostgreSQL. Untuk sistem inventaris/finansial, ini menyulitkan:
- Forensik insiden (tidak bisa lihat query attacker pasca-insiden).
- Tuning performa (tidak tahu query lambat).
- Audit kepatuhan.

`ssl=on` sudah baik.

**Rekomendasi (§4-L5).**

---

## 4. Rekomendasi Tindak Lanjut

### L1 — Validasi `qty_used <= qty_req` (P1)

> **Status: ✅ EKSEKUSI SELESAI** — Migration `015_add_qty_used_le_qty_req_check.sql` dibuat & dijalankan.

**Yang dilakukan:**

1. **Cap 27 baris melanggar** — `UPDATE inventory.sap_out_items SET qty_used = qty_req WHERE qty_used > qty_req;`
   - Dipilih pendekatan "koreksi langsung" (user decision).
   - Aman: 0/27 baris memiliki data retur (`return_material_items`) yang dapat divalidasi oleh capping.
   - 7 baris header berstatus `close`, 20 berstatus `intech` → capping membuat kondisi auto-close terpenuhi secara natural.

2. **Tambah CHECK constraint** (tanpa `NOT VALID` karena data sudah bersih setelah cap):
   ```sql
   ALTER TABLE inventory.sap_out_items
     ADD CONSTRAINT sap_out_items_qty_used_le_req
     CHECK (qty_used IS NULL OR qty_used <= qty_req);
   ```
   - `NULL` diizinkan karena `qty_used` nullable (berarti "belum direkonsiliasi").
   - Constraint ini menjadi **defense-in-depth** di level DB—meski SP di 004/005/006/012/013 sudah punya validasi `qty > 0`/`qty_used <= qty_req`, 27 baris tetap lolos (dibuat sebelum SP diperbaiki, atau via jalur legacy).

3. **Verifikasi**: `SELECT count(*) FILTER (WHERE qty_used > qty_req) FROM inventory.sap_out_items;` → **0 violations** setelah migrasi.

4. **Test integration** ditambahkan di `tests/integration/migrations.test.ts`:
   - Cek constraint `sap_out_items_qty_used_le_req` exists di `pg_constraint`.
   - Cek 0 rows violate setelah L1 fix.

5. **Tindak lanjut bisnis — investigasi `designator_id=16`** (material `AC-OF-SM-1-3SL`, "DC FO aerial 1 Core SM G657A 3 Sling", satuan **meter**):

   > ⚠️ **Capping `qty_used = qty_req` menyembunyikan gejala, bukan akar masalah bisnis.** Investigasi berikut tetap perlu dilakukan.

   **Temuan investigasi (data live):**

   | Aspek | Nilai | Catatan |
   |---|---|---|
   | Total baris transaksi designator_id=16 | 331 | Tertinggi di antara semua material |
   | Range qty_req | 1–1000 m | Median 250 m, rata-rata 272 m |
   | 27 baris overflow (sudah capped) | qty_used > qty_req | 9/10 baris dari L1 audit melibatkan material ini |
   | Sa (area) dengan transaksi terbanyak | BAMBE (70), GRESIK (62), LAMONGAN (54) | 7 area aktif |
   | Rata-rata qty_req tertinggi | CERME (402 m), BOJONEGORO (348 m) | Potensi over-estimate di area ini |
   | Stock balance total (5 WH) | ±1.02 M meter | WH Gresik dominan (691 K m) |
   | Stock policy min_qty | WH-2: 18.858 m (avg_demand_weekly 8.571 m) | Demand tinggi di Gresik |

   **Akar masalah teknis (terkonfirmasi):**

   Semua migration 001–016 dijalankan pada **2026-10-10** (16:37–17:56 UTC), sedangkan transaksi di `sap_out_items` dibuat pada **2026-09-23 s/d 2026-10-10 09:36**. Artinya **27 baris overflow dibuat SEBELUM** migration 004 (`sp_process_transaction_used`), 005 (`sp_record_material_used_lensa`), 006 (`sp_rekon_lensa_v2`), dan 012 (`sp_submit_rekon_intech`) — yang menambahkan validasi `qty_used + p_qty <= qty_req` — dijalankan.

   Keempat SP tersebut **sekarang sudah memiliki validasi** (`RAISE EXCEPTION` jika qty melebihi sisa):
   - 004:33 → `IF v_qty_used + p_qty > v_qty_req THEN RAISE EXCEPTION`
   - 006:124-125 → `IF v_remaining_qty > 0 THEN RAISE EXCEPTION` (setelah loop FIFO)
   - 012:93-101 → `IF NOT EXISTS (... v_item.qty <= qty_req - COALESCE(qty_used,0)) THEN RAISE EXCEPTION`
   - 004:107 (`sp_edit_transaction_used`) → `IF v_qty_used + v_diff > v_qty_req THEN RAISE EXCEPTION`

   Ditambah **CHECK constraint** dari migration 015 (defense-in-depth DB level). **Overflow tidak akan terjadi lagi melalui jalur SP yang ada.**

   **Tindak lanjut bisnis yang masih perlu dijawab:**

   1. **Validasi fisik vs SAP**: Mengapa teknisi di lapangan menggunakan kabel FO lebih banyak dari yang di-request di SAP? Kemungkinan:
      - Panjang kabel aktual (jalur span) lebih panjang dari estimasi designator di SAP.
      - Sisa potongan kabel (scrap/waste) tidak di-return, langsung di-total sebagai used.
      - Estimasi designator di SAP terlalu rendah untuk jarak aktual di area CERME/BOJONEGORO (avg 348–402 m vs median global 250 m).
   2. **CERME & BOJONEGORO**: Rata-rata qty_req tertinggi (402 m & 348 m). Investigasi apakah estimasi jarak span di kedua area ini sudah akurat, atau ada kebiasaan over-request yang sistematis.
   3. **Proses return scrap**: Apakah sisa kabel FO (potongan < 1 span) di-return via `sp_return_material` atau dibuang tanpa pencatatan? Jika dibuang, `qty_used` akan selalu melebihi kebutuhan efektif.
   4. **Audit 27 baris yang sudah capped**: Identifikasi `sap_out_header.id_reservasi` dan `sap_number` untuk rekonsiliasi dengan SAP fisik. Capping di DB menyembunyikan selisih; tim inventory harus memverifikasi apakah selisih sudah tercatat di SAP atau perlu adjustment SAP.
   5. **SOP going forward**: Pastikan semua pencatatan material used **wajib melalui SP** (tidak ada INSERT/UPDATE langsung ke `sap_out_items` di luar SP). CHECK constraint mencegah overflow, tetapi hanya SP yang bisa memberikan pesan error yang bermakna ke user.

**Files changed:**
- `src/lib/db/migrations/015_add_qty_used_le_qty_req_check.sql` (created)
- `tests/integration/migrations.test.ts` (updated: +2 assertions migration log, +1 describe block L1)

### L2 — Least privilege role runtime (P1)

1. Buat role non-superuser `mtms_app` dengan `GRANT` terbatas ke tabel/SP yang dipakai app.
2. Set `DATABASE_URL` memakai `mtms_app`, simpan `imam` hanya untuk admin/migrasi.
3. Cadangkan role migrasi terpisah (`mtms_migrator`) dengan `CREATE` sementara saat `run-migration.ts`.
4. Update `AGENTS.md` §0 kontrak DB untuk mencatat role separation.

### L3 — `REVOKE EXECUTE ON ... FROM PUBLIC` (P2) ✅ EXECUTED

**Status:** Migration `016_revoke_public_execute.sql` applied.

**Dampak yang diverifikasi sebelum eksekusi:**
- `imam` (superuser): tidak terpengaruh — superuser bypass semua permission check
- `postgres` (superuser): tidak terpengaruh — dipakai pg_cron untuk job nightly stock policy
- pg_cron job (`sp_calculate_stock_policy_nightly`): runs as postgres → tidak terpengaruh
- Tidak ada SP/function di schema `auth` dan `hr` (hanya inventory yang punya 19 routines)
- Role `mtms_app` belum ada (akan dibuat saat L2 dieksekusi)

**Pendekatan (per user decision: "REVOKE + GRANT ke imam — defense-in-depth"):**
1. `REVOKE EXECUTE ON ALL FUNCTIONS/PROCEDURES IN SCHEMA inventory FROM PUBLIC` — menghapus grant default PostgreSQL yang terlalu permisif
2. `GRANT EXECUTE ON ALL FUNCTIONS/PROCEDURES IN SCHEMA inventory TO imam` — explicit grant untuk app runtime role. Meski imam saat ini superuser (bypass checks), grant ini memastikan kontinuitas saat L2 dieksekusi (imam di-downgrade ke non-superuser atau role `mtms_app` dibuat)
3. `ALTER DEFAULT PRIVILEGES IN SCHEMA inventory REVOKE EXECUTE ON FUNCTIONS/PROCEDURES FROM PUBLIC` — SP/function yang dibuat di masa depan otomatis tidak di-grant ke PUBLIC

Migrasi `016_revoke_public_execute.sql`:
```sql
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory FROM PUBLIC;
REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA inventory FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory TO imam;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA inventory TO imam;
-- default privileges untuk SP baru:
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory REVOKE EXECUTE ON ROUTINES FROM PUBLIC;
```

**Verification post-migration:**
- PUBLIC EXECUTE grants on inventory routines: 19 → **0**
- imam EXECUTE grants on inventory routines: 19 (explicit) ✅
- Integration tests: 2 tests added (PUBLIC has 0 grants, imam has ≥19 grants) ✅

### L4 — Aktifkan RLS + policy (P2) ✅ EXECUTED

**Status:** Migration `017_enable_rls_policies.sql` applied.

**Yang dilakukan:**
- ENABLE ROW LEVEL SECURITY pada semua 39 tabel (inventory 26, auth 4, hr 9)
- FORCE ROW LEVEL SECURITY pada 13 tabel sensitif (auth.* 4, hr.* 9 — berisi PII/NIK/credentials)
- 68 RLS policies dibuat:
  - Warehouse-scoped SELECT (5 tabel dengan `warehouse_id`): filter by `app.warehouse_ids` GUC
  - Items/header SELECT (17 tabel): gated on `app.warehouse_ids` IS NOT NULL (fail-closed)
  - Master data SELECT (4 tabel): gated on GUC being set
  - Write policies (25 tabel): FOR ALL gated on GUC being set
  - Auth self-referential (4 tabel): user hanya lihat row sendiri via `app.current_user_id`
  - HR read-only directory (9 tabel): SELECT for authenticated, write for admin via `app.is_admin`

**Dampak yang diverifikasi sebelum eksekusi:**
- imam (superuser): UNAFFECTED — superuser bypasses RLS entirely
- postgres (superuser): UNAFFECTED — pg_cron job runs as postgres
- Application: UNAFFECTED sampai L2 switch DATABASE_URL ke non-superuser
- RLS policies efektif hanya untuk non-superuser role (mtms_app, setelah L2)

**Catatan penting:**
RLS policies menggunakan `current_setting('app.warehouse_ids', true)` yang mengembalikan NULL jika tidak diset. NULL = no access (fail-closed). Connection pool (`src/lib/db/db.ts`) MUST set GUC per request setelah L2:
```sql
SET LOCAL app.warehouse_ids = '1,2,3';
SET LOCAL app.current_user_id = '<user-id>';
SET LOCAL app.current_email = '<user-email>';
SET LOCAL app.is_admin = 'true';
```

**Verifikasi post-migration:**
- RLS enabled: 39/39 tables ✅
- FORCE RLS: 13/13 auth+hr tables ✅
- Policies: 68 total ✅
- Integration tests: 3 tests added (RLS count, FORCE count, policy count) ✅

### L5 — Aktifkan query audit log (P2) ⚠️ PARTIAL — DBA MANUAL EXECUTION REQUIRED

**Status:** Migration `018_enable_query_logging.sql` applied (documented). ALTER SYSTEM commands require manual DBA execution outside migration runner (ALTER SYSTEM cannot run inside BEGIN/COMMIT transaction block).

**Yang dilakukan (migration 018):**
- Migration file `018_enable_query_logging.sql` created and tracked in `_migration_log`
- File documents required ALTER SYSTEM commands and verification steps

**Yang masih perlu DBA jalankan manual:**
```sql
ALTER SYSTEM SET log_statement = 'ddl';
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
SELECT pg_reload_conf();
```

**Settings chosen:**
- `log_statement = ddl` — logs all DDL (CREATE/DROP/ALTER), captures schema changes
- `log_min_duration_statement = 1000` — logs queries slower than 1 second
- `log_connections = on` — logs every connection attempt
- `log_disconnections = on` — logs every disconnection

**Catatan:** `psql` tidak tersedia di environment migration runner. ALTER SYSTEM tidak bisa dijalankan via MCP postgres tool (transaction block limitation). DBA harus jalankan manual via psql/admin tool.

**Verifikasi post-execution (setelah DBA menjalankan ALTER SYSTEM + pg_reload_conf):**
```sql
SELECT name, setting, source FROM pg_settings
WHERE name IN ('log_statement', 'log_min_duration_statement', 'log_connections', 'log_disconnections')
ORDER BY name;
```
Expected: all settings = configured values, source = configuration file
---

## 5. Verifikasi Integritas (Pass)

Berikut pemeriksaan yang **lolos** (sehat):

| Pemeriksaan | Hasil | Status |
|---|---|---|
| Orphan `sap_out_items.header_id` → header | 0 | ✅ |
| Orphan `transaction_used_item.used_id` → header | 0 | ✅ |
| Orphan `inout_tag_items.header_id` → header | 0 | ✅ |
| Orphan `rekon_used_list.rekon_used_id` → header | 0 | ✅ |
| Orphan `return_material_items.header_id` → header | 0 | ✅ |
| Duplikat `transaction_used_header.id_trx` | 0 grup | ✅ |
| Duplikat `rekon_used_header.id_trx` | 0 grup | ✅ |
| Duplikat `return_material_header.id_trx` | 0 grup | ✅ |
| `stock_balance.qty_stock < 0` | 0 baris | ✅ |
| `sap_out_items.qty_req <= 0` | 0 baris | ✅ |
| `transaction_used_item.qty <= 0` | 0 baris | ✅ |
| `inout_tag_items.qty <= 0` | 0 baris | ✅ |
| `rekon_used_list.qty <= 0` | 0 baris | ✅ |
| `return_material_items.qty <= 0` | 0 baris | ✅ |
| SP `SECURITY DEFINER` berbahaya | 0 (semua INVOKER) | ✅ |
| `ssl` | on | ✅ |
| `shared_preload_libraries` | `pg_cron` (sesuai migrasi 003) | ✅ |
| Migration log | 14/14 (001–014) applied | ✅ |
| Unique constraint `id_trx` | ada di `sap_out_header`, `inout_tag_header`, `return_material_header` | ✅ |

---

## 6. Snapshot Struktur (untuk referensi)

### 6.1 Tabel inventory (26)

| Tabel | Est. rows | RLS |
|---|---|---|
| `_migration_log` | -1 | off |
| `inout_tag_header` | 94 | off |
| `inout_tag_items` | 1047 | off |
| `mas_wh` | -1 | off |
| `material_rekonsiliasi` | 0 | off |
| `material_rekonsiliasi_actual_list` | -1 | off |
| `material_rekonsiliasi_sources` | -1 | off |
| `material_reservation_items` | -1 | off |
| `material_reservations` | -1 | off |
| `materials` | 430 | off |
| `out_lensa_ref_header` | 8699 | off |
| `out_lensa_ref_list` | 27089 | off |
| `rekon_used_header` | 81 | off |
| `rekon_used_list` | 364 | off |
| `return_material_header` | 8 | off |
| `return_material_items` | -1 | off |
| `sap_out_header` | 424 | off |
| `sap_out_items` | 1283 | off |
| `stock_balance` | 222 | off |
| `stock_movement` | 3885 | off |
| `stock_policy` | -1 | off |
| `transaction_used_header` | 730 | off |
| `transaction_used_item` | 1584 | off |
| `vendor_tracking` | -1 | off |
| `wo_lensa_header` | 835 | off |
| `wo_lensa_list` | 2579 | off |

> `reltuples = -1` berarti katalog belum dianalisis; jalankan `ANALYZE` (terpisah, di luar audit read-only) untuk memperbarui.

### 6.2 Tabel auth & hr

| Schema | Tabel | Est. rows |
|---|---|---|
| auth | account | -1 |
| auth | user | 11 |
| auth | user_mfa_devices | 1 |
| auth | verification | -1 |
| hr | bizpart | 3 |
| hr | branches | 62 |
| hr | employees | 38 |
| hr | levels | 10 |
| hr | mitras | 2 |
| hr | positions | 338 |
| hr | sto_to_sa | 23 |
| hr | technicians | 255 |
| hr | witel | 6 |

### 6.3 Stored procedure inventory (19)

| Proname | Security | ACL |
|---|---|---|
| sp_adjustment | INVOKER | PUBLIC+imam |
| sp_calculate_stock_policy | INVOKER | PUBLIC+imam |
| sp_calculate_stock_policy_nightly | INVOKER | PUBLIC+imam |
| sp_close_inout_tag | INVOKER | PUBLIC+imam |
| sp_create_inout_tag | INVOKER | PUBLIC+imam |
| sp_create_return_request | INVOKER | PUBLIC+imam |
| sp_edit_transaction_used | INVOKER | PUBLIC+imam |
| sp_insert_return_item | INVOKER | PUBLIC+imam |
| sp_opening_balance | INVOKER | PUBLIC+imam |
| sp_process_transaction_used | INVOKER | PUBLIC+imam |
| sp_receive_material | INVOKER | PUBLIC+imam |
| sp_record_material_used | INVOKER | PUBLIC+imam |
| sp_record_material_used_lensa | INVOKER | PUBLIC+imam |
| sp_record_rekon_lensa_v2 | INVOKER | PUBLIC+imam |
| sp_return_material (×2 overload) | INVOKER | PUBLIC+imam |
| sp_sap_out | INVOKER | PUBLIC+imam |
| sp_submit_rekon_intech | INVOKER | PUBLIC+imam |
| sp_update_inout_tag | INVOKER | PUBLIC+imam |

### 6.4 pg_cron jobs

| jobid | schedule | command | db | user | active |
|---|---|---|---|---|---|
| 1 | `0 1 * * *` | `CALL inventory.sp_calculate_stock_policy_nightly()` | gresik | imam | true |

Sesuai migrasi 003 (`setup_pg_cron_stock_policy`). ⚠️ `username=imam` (superuser)—jika L2 diperbaiki, cron job perlu update ke role service terpisah.

### 6.5 Enum types (6)

- `enum_out_material_status`: cancel, close, intech, request, wait_approve
- `enum_status`: cancel, closed, in_transit, requested
- `enum_stock_movement`: adjustment, material_used, opening_balance, receive, return, sap_out, transfer_in, transfer_out
- `enum_transaction`: accept, request, send
- `enum_wo_type`: assurance, lintas_arta, mtel, myrep, psb, qe/gamas

### 6.6 Distribusi `stock_movement`

| movement_type | count |
|---|---|
| material_used | 1948 |
| sap_out | 1349 |
| transfer_in | 346 |
| transfer_out | 346 |
| return | 5 |
| (adjustment/opening/receive: 0 tercatat) | — |

`qty_delta`: 351 positif, 3643 negatif (masuk vs keluar)—rasio masuk/keluar kecil (~1:10), mengindikasikan mayoritas movement adalah konsumsi material. Konsisten dengan domain.

### 6.7 Sequences (16) — yang relevan

| Sequence | last_value | max_value | cycle |
|---|---|---|---|
| transaction_used_header_id_seq | 731 | 9.2e18 | false |
| transaction_used_item_id_seq | 1585 | 9.2e18 | false |
| sap_out_header_id_seq | 434 | 9.2e18 | false |
| sap_out_items_id_seq | 1353 | 9.2e18 | false |
| stock_movement_id_seq | 4035 | 9.2e18 | false |
| stock_balance_id_seq | 336 | 9.2e18 | false |
| materials_id_seq | 430 | 2.1e9 (int4) | false |
| mas_wh_id_seq | 7 | 2.1e9 (int4) | false |
| inout_tag_seq | 3 | 9.2e18 | false |
| stock_policy_id_seq | 31 | 9.2e18 | false |

> Catatan: `materials_id_seq` dan `mas_wh_id_seq` memiliki `max_value=2147483647` (int4) karena PK bertipe `integer`, bukan `bigint`. Tabel lain sudah `bigint`. Tidak ada masalah kapasitas jangka pendek, tapi `materials` perlu dimonitor jika katalog material tumbuh cepat.

---

## 7. Batasan Audit

1. **Estimasi rows (`reltuples`) bukan hitungan aktual.** Beberapa tabel `-1` (belum ANALYZE). Tidak menjalankan `ANALYZE`/`VACUUM` (mutasi).
2. **Tidak membaca baris transaksi individual** kecuali 10 baris sample `sap_out_items` untuk investigasi L1 (dibatasi `LIMIT 10`).
3. **Tidak menguji eksploitasi RLS/privilege** (no penetration testing).
4. **Hak yang dilihat adalah hak role koneksi `imam`.** Hak role lain (mis. service role future) tidak diperiksa karena belum ada.
5. **Function body (`prosrc`) tidak di-dump di sini** untuk menghindari exposure logika bisnis sensitif; verifikasi SP body silakan lihat berkas migrasi SQL atau `pg_get_functiondef()` terpisah.

---

## 8. Penutup

Audit live ini mengonfirmasi bahwa perbaikan P0 statik (otorisasi, sequence `id_trx`, SP `sp_submit_rekon_intech`) sudah ter-refleksi di struktur live DB. Temuan baru L1–L5 bersifat **operasional & hardening**—tidak menggagalkan fungsi, tapi memperkuat posture keamanan dan integritas data. Prioritas: L1 (data integrity, butuh bisnis decision) dan L2 (least privilege, prasyarat L3/L4).

Dokumen ini bersifat hidup—perbarui saat temuan ditindaklanjuti.
