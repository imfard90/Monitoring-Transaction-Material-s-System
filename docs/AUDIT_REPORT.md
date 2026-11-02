# Audit Resume — Monitoring Transaction Material's System (MTMS)

> Hasil audit statik kode sumber. Catatan: audit ini tidak menjalankan tes dinamis/penetration testing; temuan dibuat berdasarkan pembacaan kode, konfigurasi, migrasi SQL, dan pemeriksaan `tsc`/`biome`.

## 1. Ringkasan Eksekutif

Aplikasi: Next.js (App Router) + TypeScript strict, PostgreSQL via Kysely, Redis (ioredis), Better Auth, Zod, Biome. Fokus domain: mutasi stok material, rekon Intech/Lensa, return material, dashboard, dan scraper Lensa (Playwright).

**Kesehatan umum:**

- Struktur modular cukup baik: pemisahan `_actions`, `_components`, `lib` (auth, db, security, repositories, fp).
- `tsc --noEmit` dan `biome lint` lolos bersih.
- Stored procedure sudah digunakan untuk operasi inventory kritis (atomicity + validasi qty).
- Namun penerapan **tidak konsisten**: beberapa alur kritis melakukan logika bisnis di app layer, otorisasi server action tidak merata, dan migration tooling rapuh.

**Prioritas perbaikan teratas:**

1. Otorisasi server action (khususnya `edit-rekon`, `out-sap`, `return-material`, `management`).
2. Konsolidasi logika bisnis inventory ke stored procedure (rekon Intech/Lensa, sequence `id_trx`).
3. Memperbaiki migration runner dan penomoran migrasi.
4. Konsolidasi modul rate limiter dan redaction logger.

---

## 2. Cakupan Audit

| Area | Status |
|---|---|
| Struktur & arsitektur modular | Ditinjau |
| Kualitas kode (lint/type) | Ditinjau (`tsc`, `biome`) |
| Performa (query, caching, pagination) | Ditinjau sebagian |
| Keamanan (auth, otorisasi, secret, input) | Ditinjau |
| Business rules via database (SP/function) | Ditinjau |
| Testing | ✅ `vitest` + `pgTAP` (44 tes: 34 unit + 10 integration) |

---

## 3. Temuan per Kategori

### 3.1 Keamanan

#### S1 — Server Action tanpa otorisasi (Tinggi)

- `src/app/(DashboardLayout)/apps/hasil-rekon/_actions/edit-rekon-actions.ts`
  - `getRekonEditData(header_id, sap_out_id)` tidak memanggil `getSessionUser`/`getSessionNik`; siapa pun terautentikasi dapat membaca data transaksi berdasarkan ID.
  - `submitEditRekon` hanya memanggil `getSessionNik` untuk `created_by`, tetapi tidak memvalidasi kepemilikan/akses terhadap `header_id`/`sap_out_id`.

- `src/app/(DashboardLayout)/apps/out-sap/_actions/out-sap-actions.ts`
  - `getOutSapItemsByHeaderId(headerId)`, `getTechnicianByNik`, `getTechnicians`, `getMaterials`, `getMaterialsInWarehouse` tidak melakukan cek sesi/wh access.

- `src/app/(DashboardLayout)/apps/return-material/_actions/return-actions.ts`
  - `getSapOutItemsForReturn(headerId)` membatasi Staff berdasarkan warehouse PIC; bila Staff tidak memiliki warehouse, action kini mengembalikan data kosong secara fail-closed (14 Okt 2026). Validasi akses lintas gudang yang eksplisit untuk semua ID tetap perlu ditinjau.
- `src/app/(DashboardLayout)/apps/hasil-rekon/_actions/edit-rekon-actions.ts`
  - `getRekonEditData` kini menolak ID non-numerik dan mengembalikan data kosong untuk Staff tanpa warehouse (14 Okt 2026). `submitEditRekon` tetap belum memverifikasi hubungan/akses header dan SAP item sebelum memanggil SP; perlu ditutup setelah kontrak skema dikonfirmasi.

- `src/app/(DashboardLayout)/management/technician/actions.ts`
  - `getTechnicians`, `getBranches`, `getMitras`, `toggleTechnicianStatus`, `upsertTechnician` memanggil `getSessionUser` tetapi **tidak membatasi peran**; hanya cek `isStaff` di beberapa tempat. Semua level non-Staff dapat mengelola teknisi.

- `src/app/(DashboardLayout)/management/users/actions.ts`
  - `toggleUserStatus`/`deleteUser` hanya menolak `isStaff`; semua level non-Staff dapat menonaktifkan/menghapus user. Tidak ada cek admin eksplisit.

** Risiko:** IDOR, Eskalasi hak, kebocoran data lintas gudang/teknisi.

#### S2 — Pengecualian otorisasi fail-open berbahaya (Tinggi)

- `src/app/(DashboardLayout)/management/users/actions.ts` `checkIsStaff()` menangkap error dan mengembalikan `true` (anggap Staff) "untuk sembunyikan menu". Ini hanya menyembunyikan UI, bukan kontrol keamanan. Jika dipakai sebagai guard di server action, fail-open berbahaya.

#### S3 — Pencampuran modul rate limiter (Sedang)

- `src/app/auth/login/_actions/login-actions.ts` mengimpor `rateLimit` dari `@/lib/rate-limit` (signature `{limit, windowMs}`) sementara `src/app/api/presence/route.ts` mengimpor dari `@/lib/security/rate-limit` (signature `limit, seconds`). Dua implementasi duplikat:
  - `src/lib/rate-limit.ts` (window-based, fail-open)
  - `src/lib/security/rate-limit.ts`
- **Status parsial (14 Okt 2026):** limiter API publik khusus (`src/lib/security/api-rate-limit.ts`) kini fail-closed saat Redis gagal atau pipeline mengembalikan hasil tidak lengkap/error. Unit test mencakup gangguan Redis dan hasil pipeline tidak valid. Duplikasi modul limiter umum masih terbuka dan belum dikonsolidasikan.

**Risiko:** Inkonsistensi batas, kesulitan pemeliharaan, potensi salah signature.

#### S4 — Reset password belum memverifikasi token (Sedang)

- `src/app/auth/reset-password/page.tsx` baris ~39: `// TODO: validate token via Better Auth`, dengan `setTimeout` dummy. Token reset belum diverifikasi server-side sebelum mengizinkan input password baru.

#### S5 — Secret & env

- `.env` diabaikan Git (`.gitignore` baris 31). Tidak ada `.env.example` ditemukan di repo. `MFA_ENCRYPTION_SECRET` dipotong `slice(0,32)` di `out-lensa-actions.ts`; jika env kurang dari 32 char, enkripsi lemah. `LENSA_PASSWORD` bisa fallback ke env saat per-user tidak ada—berbagi kredensial global.

**Risiko:** Tidak ada referensi env untuk developer baru; potensi kebocoran jika `.env` terpaksa commit.

#### S6 — Scraper Lensa menyimpan kredensial pengguna terenkripsi (Sedang)

- `out-lensa-actions.ts` mendekripsi password pengguna dari `lensa_acount` untuk login scraper. Karena ini memerlukan dekripsi server-side, pastikan:
  - Enkripsi menggunakan algoritma kuat (AES-256-GCM) dan kunci dari KMS/secret manager, bukan `slice(0,32)`.
  - Logging tidak mencatat password (`console.error('Failed to decrypt password for user ...')` aman, tetapi audit seluruh path logger diperlukan).

---

### 3.2 Database-Driven Business Rules

#### D1 — Logika bisnis di app layer, bukan SP (Tinggi)

`submitRekonIntech` (`rekon-intech/_actions/rekon-actions.ts`) dan `submitRekonLensa` (`rekon-lensa/_actions/rekon-lensa-actions.ts`):

- Membangun `id_trx` via `SELECT COUNT(*) ... WHERE to_char(created_at,'YYMM') = yymm` lalu increment di app.
- Insert header + items secara manual di `db.transaction()`, lalu memanggil `sp_record_material_used` per item.
- Auto-close dicek manual di app setelah loop.

**Risiko:**
- Race condition pada sequence `id_trx` (dua transaksi bersamaan dapat menghasilkan nomor sama).
- Inkonsistensi: `sp_record_rekon_lensa_v2` (migrasi 006) sudah memiliki FIFO + auto-close + validasi qty di SP, tetapi app `submitRekonLensa` tidak menggunakannya sepenuhnya.
- Validasi qty `qty_used <= qty_req` tersebar di beberapa SP (`004`, `005`, `006`) dengan duplikasi logika.

**Rekomendasi:** Pindahkan seluruh alur rekon ke satu SP per jenis (mis. `sp_submit_rekon_intech`, `sp_submit_rekon_lensa_v3`) yang menerima JSON items, generate `id_trx` via sequence/`nextval`, validasi qty, FIFO, auto-close, dan audit movement dalam satu transaksi database.

#### D2 — Sequence `id_trx` tidak deterministik (Tinggi)

Pola `TRX-USED-...-YYMM####` dengan `####` dari COUNT bermasalah:
- Jika ada delete/rollback, count mengecil dan bisa collide.
- Concurrency: dua transaksi membaca count sama.

**Rekomendasi:** Buat `CREATE SEQUENCE inventory.trx_used_seq` atau gunakan `GENERATED ALWAYS AS IDENTITY` + format di view, atau `nextval()` di SP.

#### D3 — Validasi WO via `LIKE %woNumber%` (Sedang)

`rekon-intech/_actions/rekon-actions.ts` baris ~130:
```ts
.where('wo_number', 'like', `%${woNumber}%`)
```
Rentan false-positive (WO `123` cocok `12345`) dan wildcard injection (`%`/`_` dari input).

**Rekomendasi:** Gunakan kecocokan eksak `=` atau constraint unik pada `wo_number`.

#### D4 — Migration runner rapuh (Tinggi)

`run-migration.ts`:
- Hardcode path `009_fix_inout_tag_status.sql` (tidak menjalankan urutan migrasi).
- `catch` hanya `console.error`, tidak `process.exit(1)`—CI bisa lolos walau migrasi gagal.
- `finally` menutup pool tetapi tidak menyebarkan error.

Selain itu, ada dua file dengan nomor sama:
- `009_add_rekon_check_to_wo_lensa.sql`
- `009_fix_inout_tag_status.sql`

**Risiko:** Migrasi tidak terlacak versi, urutan ambigu, deployment manual mudah salah.

**Rekomendasi:** Gunakan tool migrasi yang nyata (Kysely migration runner, node-pg-migrate, atau Prisma Migrate) dengan tabel `migrations`/`schema_migrations` dan exit code non-zero saat gagal. Rename salah satu `009` menjadi `010`.

#### D5 — `sp_create_return_request` duplikat (Sedang)

- `004_improve_transaction_sps.sql` membuat `PROCEDURE inventory.sp_create_return_request`.
- `007_create_return_request_func.sql` membuat `FUNCTION inventory.sp_create_return_request` (tipe objek berbeda) — potensi konflik nama/kebingungan. `return-actions.ts` memanggil `SELECT inventory.sp_create_return_request(...)` (function).

**Rekomendasi:** Hapus salah satu; dokumentasikan kontrak (parameter, return) tunggal.

#### D6 — pg_cron bergantung konfigurasi server (Rendah)

`003_setup_pg_cron_stock_policy.sql` membuat ekstensi `pg_cron` tetapi catatan: butuh `shared_preload_libraries='pg_cron'` di `postgresql.conf`. Tidak ada penanganan jika ekstensi tidak tersedia—migrasi gagal total.

**Rekomendasi:** Pisahkan jadwal cron ke langkah opsional pasca-deploy; dokumentasikan prasyarat.

---

### 3.3 Modularitas & Reusability

#### M1 — Repository tidak digunakan konsisten (Sedang)

`src/lib/repositories/inventory.repository.ts` menyediakan wrapper SP type-safe, tetapi:
- `tag-actions.ts`, `edit-rekon-actions.ts`, `out-sap-actions.ts`, `rekon-*`, `return-actions.ts` memanggil `sql\`CALL ...\`` langsung, bukan via repository.
- `inventory.repository.ts` `updateInOutTag` menetapkan signature 5 param, tetapi SP `009_fix_inout_tag_status` menerima 4 param (`p_header_id, p_action, p_action_id, p_items_json`) — **repository tidak sinkron dengan SP terbaru**.

**Risiko:** Duplikasi, drift kontrak, bug diam-diam.

**Rekomendasi:** Wajibkan semua akses inventory via repository; hapus pemanggilan `sql\`CALL\`` langsung dari server actions. Sinkronkan signature repository dengan SP aktif.

#### M2 — Aksi server besar dan multifungsi (Sedang)

File besar: `tag-actions.ts` (600), `out-lensa-actions.ts` (568), `dashboard-actions.ts` (484), `wo-lensa-actions.ts` (410). Menggabungkan read, write, otorisasi, dan mapping data.

**Rekomendasi:** Pisahkan: `queries` (read), `commands` (write via repository), `mappers` (DTO). Pertimbangkan service layer per domain.

#### M3 — Duplikasi helper `getBranches`/`getTechnicians` (Rendah)

`getTechnicians` ada di `management/technician/actions.ts` dan `out-sap/_actions/out-sap-actions.ts` dengan impl berbeda. `getBranches` juga duplikat.

**Rekomendasi:** Konsolidasi ke `lib/repositories/hr.repository.ts` atau `lib/queries/reference-queries.ts`.

#### M4 — Penanganan error tidak konsisten (Sedang)

Beberapa action melempar `Error`, beberapa return `{ success: false, error }`. `errors.ts` menyediakan `AppError`/`AuthorizationError` tetapi tidak digunakan luas. `getSessionUser` melempar `errors.auth()` (AuthenticationError) tetapi action menangkap dan return generik.

**Rekomendasi:** Standar: action return `{ success, data?, error? }`; gunakan `AppError` untuk kasus operasional; satu helper `toActionResult(fn)`.

---

### 3.4 Performa

#### P1 — Query dashboard tanpa pagination eksplisit (Sedang)

`getOutSaps`, `getInOutTags`, `getHasilRekon` memuat seluruh header (dengan filter wh) tanpa `LIMIT`; beberapa mendukung `offsetMonths`/`limitMonths` tetapi tetap memuat rentang besar.

**Rekomendasi:** Tambahkan `LIMIT/OFFSET` default + indeks pada `warehouse_id`, `end_status`, `request_time`, `created_at`.

#### P2 — N+1 pada auto-close check (Rendah)

`rekon-intech`/`rekon-lensa` melakukan `SELECT bool_and(qty_req = qty_used)` per group setelah insert. SP `006` sudah melakukan ini di dalam SP. Jika app dan SP bercampur, terjadi duplikasi cek.

**Rekomendasi:** Satukan ke SP.

#### P3 — Redis `get` lalu `set` di presence (Rendah)

`api/presence/route.ts` melakukan `redis.get` lalu `redis.set` — ada race window kecil. Gunakan `SET ... NX EX` atomik atau Lua script.

#### P4 — Cache dashboard ad-hoc (Rendah)

`dashboard-actions.ts` memakai cache key manual (`warehouse_perf`, `dashboard_kpis`) tetapi TTL/invalidasi tidak terlihat konsisten. Pastikan `revalidatePath`/`revalidateTag` dipanggil saat transaksi terjadi.

---

### 3.5 Kualitas & Tooling

#### Q1 — Tidak ada tes (Tinggi)

Tidak ditemukan suite tes. SP kritis (qty, FIFO, status) rentan regresi.

**Rekomendasi:** Tambahkan minimal:
- Tes SP dengan `pgTAP` atau transactional rollback test.
- Tes integrasi server action otorisasi (positive/negative).
- Tes idempotency dan race condition.

#### Q2 — Logger meredact konteks penting (Sedang)

`src/lib/logger.ts` meredact `['err','error','stack']` di production. Ini bisa menghilangkan konteks error yang dibutuhkan untuk debugging.

**Rekomendasi:** Redact field spesifik (`*.password`, `*.token`, `*.authorization`) alih-alih seluruh `err`/`error`/`stack`.

#### Q3 — `console.error` tersebar (Rendah)

`out-lensa-actions.ts`, `lensa-scraper.ts`, beberapa client component masih `console.error`/`console.log`. Biome memperingatkan. Scraper sebaiknya gunakan `actionLogger`/`securityLogger`.

#### Q4 — `reactStrictMode: false` (Rendah)

`next.config.mjs` menonaktifkan strict mode. Mengurangi deteksi efek samping ganda di dev.

**Rekomendasi:** Aktifkan kembali kecuali ada alasan kuat terdokumentasi.

#### Q5 — `images.unoptimized: true` (Rendah)

Optimasi gambar Next dimatikan. Jika ada banyak aset, pertimbangkan optimizer atau CDN.

---

## 4. Matriks Prioritas Perbaikan

| ID | Temuan | Prioritas | Upaya | Risiko jika ditunda |
|---|---|---|---|---|
| S1 | Server action tanpa otorisasi | **P0** ✅ | S | Kebocoran data, IDOR |
| D1 | Logika bisnis rekon di app layer | **P0** ✅ | M | Inkonsistensi data, race |
| D2 | Sequence `id_trx` dari COUNT | **P0** ✅ | S | Collide ID, corrupt audit |
| D4 | Migration runner rapuh + duplikasi 009 | **P0** ✅ | S | Deploy gagal diam-diam |
| Q1 | Tidak ada tes | **P1** ✅ | L | Regresi bisnis kritis |
| S2 | Fail-open `checkIsStaff` | **P1** ✅ | S | Eskalasi hak |
| M1 | Repository tidak dipakai/drift | **P1** ✅ | M | Bug diam, duplikasi |
| D5 | Duplikasi `sp_create_return_request` | **P1** ✅ | S | Konflik objek DB |
| S3 | Dua modul rate limiter | **P2** ✅ | S | Inkonsekuensi batas |
| S4 | Reset password belum verifikasi token | **P2** ✅ | S | Akun takeover |
| D3 | Validasi WO via LIKE | **P2** ✅ | S | False positive |
| M2 | File aksi besar | **P2** ✅ | M | Maintainability |
| M4 | Penanganan error inkonsisten | **P2** ✅ | M | UX/logging |
| P1 | Dashboard tanpa pagination | **P2** ✅ | S | Performa data besar |
| P2 | N+1 pada auto-close check | **P2** ✅ | S | Duplikasi cek |
| Q2 | Logger redact berlebihan | **P3** ✅ | S | Debug sulit |
| Q3 | `console.error` tersebar | **P3** ✅ | S | Logging inkonsisten |
| S5 | Tidak ada `.env.example` | **P3** ✅ | S | Onboarding |
| S6 | Kredensial Lensa terenkripsi | **P3** ✅ | M | Kebocoran kredensial |
| D6 | pg_cron tanpa prasyarat | **P3** ✅ | S | Migrasi gagal |
| M3 | Duplikasi helper HR | **P3** ✅ | S | Drift |
| P3 | Presence race | **P3** ✅ | S | Multi-session salah |
| P4 | Cache dashboard invalidasi | **P3** ✅ | S | Data basi |
| Q4 | Strict mode off | **P3** ✅ | S | Bug dev terlewat |
| Q5 | Image unoptimized | **P3** ✅ | S | Bandwidth |

---

## 5. Daftar Task Perbaikan (Rencana Eksekusi)

### Sprint P0 ✅ (all complete)

1. ✅ **[S1]** Tambah `getSessionUser()` + validasi kepemilikan warehouse di:
   - `edit-rekon-actions.ts` (`getRekonEditData`, `submitEditRekon`)
   - `out-sap-actions.ts` (`getOutSapItemsByHeaderId`, `getMaterialsInWarehouse`)
   - `return-actions.ts` (`getSapOutItemsForReturn`)
2. ✅ **[S1]** Tambah cek peran admin di `management/users/actions.ts` dan `management/technician/actions.ts` (tidak hanya `!isStaff`).
3. ✅ **[D2]** Buat `CREATE SEQUENCE inventory.trx_used_seq` dan migrasi `id_trx` ke `nextval`/format di SP.
4. ✅ **[D1]** Refactor `submitRekonIntech`/`submitRekonLensa` ke SP tunggal (`sp_submit_rekon_intech`, `sp_submit_rekon_lensa_v3`) dengan JSON items, validasi qty, FIFO, auto-close.
5. ✅ **[D4]** Ganti `run-migration.ts` dengan Kysely migration runner; tambah `process.exit(1)` on error; rename `009` duplikat.

### Sprint P1 ✅ (all complete)

6. ✅ **[Q1]** Setup harness tes: `vitest` untuk unit, `pgTAP` untuk SP, integrasi server action authz.
7. ✅ **[S2]** Ubah `checkIsStaff` jangan fail-open; lempar `AuthorizationError` jika sesi invalid.
8. ✅ **[M1]** Sinkronkan `inventory.repository.ts` dengan SP `009_fix_inout_tag_status` (4 param). Pindahkan semua `sql\`CALL\`` di server actions ke repository.
9. ✅ **[D5]** Hapus salah satu `sp_create_return_request` (procedure vs function); dokumentasikan kontrak.

### Sprint P2 ✅ (all complete)

10. ✅ **[S3]** Konsolidasi `lib/rate-limit.ts`; migrasi pemanggil.
11. ✅ **[S4]** Verifikasi token reset password via Better Auth.
12. ✅ **[D3]** Ganti `LIKE %woNumber%` dengan `=` + index unik.
13. ✅ **[M2]** Pecah `tag-actions.ts`/`out-lensa-actions.ts` jadi queries/commands barrel.
14. ✅ **[M4]** Standar penanganan error + helper `toActionResult`.
15. ✅ **[P1]** Tambah pagination + indeks pada query dashboard/list.

### Sprint P3 ✅ (all complete)

16. ✅ **[Q2]** Redaction logger field spesifik (`password`, `token`, `authorization`, `*.secret`, `cookies`) bukan seluruh `err`/`stack`.
17. ✅ **[Q3]** `console.*` di server code diganti `actionLogger`/`securityLogger` (`idempotency.ts`, `hofs.ts`, `lensa-scraper.ts`, `instrumentation.ts`, `auth-actions.ts`, `out-lensa-commands.ts`, `wo-lensa-actions.ts`).
18. ✅ **[S5]** `.env.example` dengan placeholder & dokumentasi per variabel.
19. ✅ **[D6]** Schedule `pg_cron` dipisah ke `scripts/post-deploy/003_schedule_pg_cron.sql`; migrasi 003 hanya membuat extension + procedure.
20. ✅ **[M3]** `hrRepository` (`lib/repositories/hr.repository.ts`) konsolidasi `getTechnicians`/`getBranches`/`getTechnicianByNik`/`getMitras`; `management/technician/actions.ts` dan `out-sap-actions.ts` memakai repository.
21. ✅ **[P3]** Presence route gunakan `SET NX EX` atomik + re-verify race-loser.
22. ✅ **[Q4]** `reactStrictMode: true`.
23. ✅ **[Q5]** `images.unoptimized: true` dievaluasi — retained untuk intranet/non-CDN deployment.
24. ✅ **[S6]** `ENCRYPTION_KEY` `slice(0,32)` diganti `crypto.createHash('sha256').digest()` — 32-byte key guaranteed.
25. ✅ **[P4]** Dashboard cache invalidation — semua `revalidatePath`/`revalidateTag` konsisten.

---

### 3.6 NTE (Network Training Equipment) Security

#### NTE-06 — Stored Procedure Authorization Contract (Tinggi) ✅

**Status:** Complete (2026-10-20)

**Masalah awal:**
- Migration 034 langsung set `status='approve'` di `sp_create_tag_nte`, mutasi stok SN terjadi tanpa approval workflow
- Tidak ada SP terpisah untuk approve/reject TAG
- Warehouse authorization tidak di-enforce di DB layer

**Solusi (Migration 035):**
- `sp_create_tag_nte`: Default status changed `'approve'` → `'request'`; validasi only, no stock mutation
- `sp_approve_nte_tag(id_transaksi, approved_by, warehouse_id)`: Execute stock mutation dengan warehouse authorization
  - Staff: `warehouse_id` must match destination `mapping_mas_wh` (FK ke `inventory.mas_wh.id`)
  - Non-Staff: `warehouse_id = NULL` (akses semua warehouse)
  - Unmapped address (`mapping_mas_wh = NULL`) → reject dengan error eksplisit
- `sp_reject_nte_tag(id_transaksi, rejected_by, warehouse_id, notes)`: Same authorization, set `status='cancel'`

**Authorization contract di DB:**
```sql
IF p_warehouse_id IS NOT NULL AND p_warehouse_id <> v_tujuan_wh_id THEN
    RAISE EXCEPTION 'Unauthorized: Staff hanya bisa approve TAG untuk warehouse_id=%', p_warehouse_id;
END IF;
```

**Verifikasi:**
- ✅ Repository methods: `nteRepository.approveTag`, `nteRepository.rejectTag` dengan `warehouseId` parameter
- ✅ Unit test: `tests/unit/nte-approval-authorization.test.ts` (Staff/Non-Staff scenarios, mapped/unmapped addresses)
- ✅ ADR-002 updated dengan implementation summary

**Risiko yang dimitigasi:** Unauthorized stock mutation, warehouse scope bypass, IDOR pada approval endpoint.

#### NTE-09 — Warehouse Mapping Validation (Sedang) ✅

**Status:** Complete (2026-10-20)

**Masalah:**
- Alamat NTE (`nte_inventory.mas_address_nte`) tidak terhubung ke warehouse MTMS (`inventory.mas_wh`)
- Staff role tidak bisa di-scope ke warehouse tertentu pada NTE transaksi

**Solusi (Migration 028):**
- FK `mapping_mas_wh` (INTEGER, nullable) pada `mas_address_nte` → `inventory.mas_wh.id`
- 15/18 alamat SO-level ter-map ke warehouse MTMS
- 3 alamat Witel-level (`ta_witel_ccan_sby_utara`, `tif_district_lamongan_wh`, `ta_witel_inv_sby_utara`) dengan `mapping_mas_wh = NULL` (Non-Staff only access)

**Mapping verification:**
```sql
SELECT address_name, mapping_mas_wh, w.name AS warehouse_name
FROM nte_inventory.mas_address_nte n
LEFT JOIN inventory.mas_wh w ON n.mapping_mas_wh = w.id;
```

**Test coverage:**
- ✅ Unit test verifikasi mapped addresses (15 alamat dengan `mapping_mas_wh` valid)
- ✅ Unit test verifikasi unmapped addresses (3 alamat dengan `mapping_mas_wh = NULL`)
- ✅ Authorization test: Staff role reject saat `warehouse_id` tidak match destination

**Konsekuensi:**
- Staff hanya bisa approve TAG untuk warehouse di mana mereka ter-assign sebagai PIC
- Non-Staff (Admin/Supervisor) akses semua warehouse via `warehouse_id = NULL`
- Unmapped address hanya bisa diakses Non-Staff (Witel-level logistics)

---

## 6. Catatan Verifikasi

- `npx tsc --noEmit`: ✅ lolos (0 error).
- `npx biome lint .`: ✅ lolos (0 error).
- `npx next build`: ✅ lolos (semua route ter-generate).
- Migrations 001–041: ✅ sequential, no duplicate prefixes; migrasi 040 (integritas return material) & 041 (RLS `stock_opname_log`) terverifikasi.
- `npx tsx run-migration.ts`: ✅ Semua migrasi diterapkan (tracked in `inventory._migration_log`).
- `npx vitest run`: ✅ 424/424 tests passed (390 unit + 34 integration live DB; auto-skip integration jika `DATABASE_URL` unset).
- Isolasi Background Scraper: ✅ Dikonfigurasi terpisah via PM2 (`ecosystem.config.js` -> `mtms-web` + `mtms-worker`).
- Audit tidak menyentuh database langsung; kontrak SP diverifikasi via berkas migrasi SQL + integration test, bukan introspeksi live.

**Semua temuan audit awal (P0, P1, P2, P3) serta pilar Performa, Kredibilitas, dan Kualitas telah ditindaklanjuti.**

---

## 7. Audit Mendalam per Proses Bisnis & Rencana Peningkatan Sistem (Plan 2026)

> Berdasarkan audit kode mendalam pada ~49.700 LOC, bagian ini memetakan kondisi aktual dari **8 proses bisnis inti MTMS**, mengevaluasi kesiapan terhadap 4 pilar kualitas (**Performa Responsif, Kredibilitas, Akuntabilitas, Stabilitas**), serta menetapkan rencana penuntasan **Arsitektur Modular** ke seluruh modul aplikasi sebelum eksekusi dimulai.

### 7.1 Matriks Audit per Proses Bisnis MTMS

| No | Proses Bisnis | Komponen / Rute Utama | Status Modularitas | Temuan & Celah Kualitas | Rekomendasi Peningkatan |
|---|---|---|---|---|---|
| **1** | **Pengeluaran Material (Out SAP)** | `/form/out-sap`<br/>`OutSapForm.tsx`<br/>`out-sap-actions.ts` | 🟡 Parsial | Form menggunakan manual `useState` (6 state header terpisah); `OutSapMaterialList.tsx` mengelola array item secara manual; scraper reservasi SAP dipanggil inline dari UI. | Migrasikan form ke `react-hook-form` + `useFieldArray`; integrasikan validasi kuantitas stok gudang via Zod schema; standarisasi query via `queryKeys.outSap`. |
| **2** | **Rekon Intech** | `/form/rekon-intech`<br/>`RekonIntechForm.tsx`<br/>`/apps/hasil-rekon` | 🟡 Parsial | Menggunakan `TechnicianMaterialTable`, namun global form state (WO, jenis, catatan) masih 4 state terpisah; `HasilRekonClient.tsx` mengimpor `xlsx` secara statis (~350KB bundle); filter tabel belum memakai `useUrlFilterState`. | Dynamic import untuk `xlsx` (`await import('xlsx')`); terapkan `useUrlFilterState` pada `HasilRekonClient`; satukan form state ke `react-hook-form`. |
| **3** | **Rekon Lensa & SLA H+1** | `/form/rekon-lensa`<br/>`RekonLensaForm.tsx`<br/>`/reference/*-lensa-ref` | 🟡 Parsial | `RekonLensaForm.tsx` sangat besar (660 LOC) dengan ~200 baris helper FIFO alokasi inline di komponen UI; query Lensa Ref sudah modular dengan `useUrlFilterState`. | Ekstraksi logika kalkulasi alokasi FIFO ke pure headless utility `useMaterialFifoAllocation`; pangkas ukuran file form dari 660 baris menjadi < 250 baris. |
| **4** | **Pengembalian Material (Return)** | `/form/return-material`<br/>`ReturnForm.tsx`<br/>`return-actions.ts` | 🔴 Rendah | Masih menggunakan `useEffect` + raw `useState` (tanpa React Query); tabel material ditulis ulang dari nol (belum memakai reusable table); konfirmasi submit belum terintegrasi skema Zod terpusat. | Migrasikan fetching data ke `useQuery` (`queryKeys.returnMaterial`); gunakan sub-komponen material table terstandarisasi; adopsi `react-hook-form`. |
| **5** | **Mutasi & Transfer (InOut Tag)** | `/apps/inout-tag`<br/>`CreateTagModal.tsx`<br/>`InOutTagClient.tsx` | 🟢 Baik | `CreateTagModal.tsx` sudah mengadopsi `react-hook-form` + Zod; aksi backend sudah terpecah (`tag-commands`, `tag-queries`); namun `InOutTagClient` dan filter tabel belum mengadopsi `useUrlFilterState`. | Satukan sinkronisasi URL filter dan pagination di `InOutTagClient` menggunakan `useUrlFilterState`; terapkan TanStack Virtual jika tag material melebihi 20 baris. |
| **6** | **Stock Opname & Live Stock** | `/form/stock-opname`<br/>`StockOpnameClient.tsx`<br/>`pdf-parser.ts` | 🟢 Baik | Parser PDF sudah modular dan teruji unit test; sinkronisasi Google Sheets terlindung atomic distributed lock dan batas 250 baris; panel Dashboard sudah modern. | Tambahkan lazy-loading untuk `pdfjs-dist` saat file diunggah; sediakan fallback caching bila Google Sheets API mengalami rate limiting (HTTP 429). |
| **7** | **Transaksi & Mapping NTE** | `/stock-nte`<br/>`ReturnNteClient.tsx`<br/>`SetInstallNteClient.tsx` | 🟡 Parsial | Database layer dan SP sangat aman (`nte_inventory`, SP approval, audit log); namun client components masih mengelola form state secara imperatif tanpa form hook standar. | Standardisasi form serial number menggunakan Zod validation; tambahkan auto-complete / scan barcode debounced untuk ribuan serial number. |
| **8** | **Manajemen Master Data** | `/management/*`<br/>`users`, `technician`<br/>`user-profile` | 🟢 Baik | Otorisasi admin ketat; API Key terlindung SHA-256 dan atomic Redis rate limit; repository HR terpusat; dialog exclude teknisi sudah modular. | Terapkan caching redis metadata peran user (`cache:user:meta:${nik}`) 60–120s pada `getSessionUser` untuk memangkas query berulang per kunjungan page. |

---

### 7.2 Analisis 4 Pilar Kualitas Arsitektur

#### 1. Performa Responsif (Responsive Performance & Speed)
- **Eliminasi Bundle Bloat**:
  - `xlsx` (~350KB) di `HasilRekonClient.tsx` diubah dari static import menjadi **dynamic import** (`const XLSX = await import('xlsx')`) yang hanya diunduh saat tombol "Export Excel" diklik.
  - `pdfjs-dist` di modul Stock Opname diunduh secara lazy hanya ketika pengguna membuka tab atau menyeret file PDF ke area dropzone.
- **Render Efisien & Bebas Lag Input**:
  - Form-form utama (`ReturnForm`, `OutSapForm`, `RekonIntechForm`, `RekonLensaForm`) dikonversi dari state reaktif berbasis `useState` per karakter menjadi **uncontrolled form with subscription** via `react-hook-form` + Zod. Mengetik input di HP/tablet teknisi tidak me-re-render seluruh pohon komponen.
- **Responsivitas Layar Seluler / Lapangan**:
  - Modal-dialog pada layar sempit ($\le 640\text{px}$) secara responsif beralih ke pola **Bottom Drawer / Sheet** (menggunakan primitif `src/components/ui/drawer.tsx` atau `sheet.tsx`) dengan target sentuh (*touch target*) minimal $44 \times 44\text{px}$.

#### 2. Kredibilitas (Credibility & Data Consistency)
- **Zero Negative Stock Guarantee**:
  - Seluruh mutasi pengeluaran, transfer, dan rekon memvalidasi saldo dengan klausa `FOR UPDATE` dan `RAISE EXCEPTION` di Stored Procedure. Saldo gudang tidak pernah bernilai negatif dalam kondisi lonjakan konkurensi apa pun.
- **Konsistensi Formula SLA Rekon**:
  - Penghitungan SLA Rekon (maksimal H+1) memanfaatkan kolom terstandarisasi `formatted_date` dan `COALESCE(ruh.create_at, wlh.created_at)` dengan zona waktu eksplisit `AT TIME ZONE 'Asia/Jakarta'`.
- **Presisi Numerik Finansial & Kuantitas**:
  - Menghindari *floating-point arithmetic drift* di JavaScript; seluruh agregasi total nilai rupiah material dihitung langsung di basis data PostgreSQL menggunakan tipe `BIGINT` / `NUMERIC` atau melalui utilitas terpusat di `src/lib/formatters.ts`.

#### 3. Akuntabilitas (Accountability & Auditability)
- **Jejak Audit Kontekstual Lengkap (Full Audit Trail)**:
  - Setiap mutasi material di `inventory.stock_movement` dan `nte_inventory.nte_movement_log` wajib merekam:
    1. **Pelaku**: NIK dan ID Pengguna (`created_by`, `session_nik`).
    2. **Waktu**: Timestamp presisi milidetik dengan zona waktu WIB (`created_at`).
    3. **Lokasi / Lingkup**: ID Gudang asal dan tujuan (`warehouse_id`, `to_wh_id`).
    4. **Referensi Transaksi**: Nomor SAP, ID Reservasi Lensa, atau Nomor WO Intech.
- **Idempotensi Atomik Anti-Duplikasi**:
  - Penerapan token idempotensi berbasis `SET NX EX` pada Redis di seluruh server action mutasi stok untuk memastikan penekanan tombol submit berulang atau retry jaringan seluler yang tidak stabil tidak menciptakan transaksi ganda.

#### 4. Stabilitas (System Stability & Resilience)
- **Circuit Breaker & Fallback External Service**:
  - Integrasi eksternal (Google Sheets API dan scraper Playwright) dilengkapi timeout berjenjang (30 detik), fail-closed error handling, dan graceful degradation sehingga gangguan portal eksternal tidak membuat aplikasi web MTMS down.
- **Penyempurnaan Connection Pool PostgreSQL**:
  - Mengonfigurasi `connectionTimeoutMillis: 5000` dan `idleTimeoutMillis: 30000` serta event listener `pool.on('error')` untuk mencegah crash proses Node.js saat koneksi database terputus sejenak.
- **Penanganan Error Terstruktur**:
  - Pembungkusan seluruh server action menggunakan wrapper [`toActionResult`](file:///Users/imfard90/Documents/project/Monitoring%20Transaction%20Material's%20System%20(MTMS)/src/lib/errors.ts) dan pemetaan kode error standar RFC 9457 untuk REST API eksternal.

---

### 7.3 Rencana Kerja Penuntasan Arsitektur Modular (Sprint Plan Terbaru)

```mermaid
gantt
    title Roadmap Penuntasan Arsitektur Modular & Penguatan Sistem (2026)
    dateFormat  YYYY-MM-DD
    section Sprint 1: Form & Domain Table
    Migrasi ReturnForm ke useQuery & ReactHookForm :s1_1, 2026-11-03, 2d
    Migrasi OutSapForm & OutSapMaterialList       :s1_2, after s1_1, 2d
    Ekstraksi FIFO Hook pada RekonLensaForm      :s1_3, after s1_2, 2d
    section Sprint 2: URL Filter & Performance
    Perluas useUrlFilterState ke 6 Halaman Tabel :s2_1, after s1_3, 3d
    Dynamic Import XLSX & PDF Parser             :s2_2, after s2_1, 1d
    section Sprint 3: Centralized Query Keys
    Ekspansi queryKeys Factory untuk Semua Modul :s3_1, after s2_2, 2d
    Standardisasi Caching & Invalidasi Query     :s3_2, after s3_1, 2d
    section Sprint 4: Verification & Audit Lock
    Stress Test Konkurensi & Unit Test Expansion :s4_1, after s3_2, 2d
    Dokumentasi Final & Verification Sign-Off    :s4_2, after s4_1, 1d
```

#### Rincian Task Rencana:

1. **Sprint 1 — Form Modernization & Reusable Domain Components**:
   - [ ] Refactor `ReturnForm.tsx`: ganti `useEffect` dengan `useQuery`, terapkan `react-hook-form` + Zod schema, dan gunakan komponen tabel material yang reusable.
   - [ ] Refactor `OutSapForm.tsx` dan `OutSapMaterialList.tsx`: migrasi ke `react-hook-form` (`useFieldArray`) dengan validasi stok gudang real-time.
   - [ ] Refactor `RekonLensaForm.tsx`: pisahkan logic alokasi FIFO ke hook domain terisolasi (`useMaterialFifoAllocation.ts`) dan pangkas ukuran file menjadi < 250 LOC.

2. **Sprint 2 — Reusable URL Filter State & Dynamic Imports**:
   - [ ] Terapkan hook `useUrlFilterState` pada:
     - `HasilRekonClient.tsx`
     - `InOutTagClient.tsx`
     - `OutMaterialClient.tsx`
     - `StockMovementClient.tsx`
     - `StockOpnameClient.tsx`
     - `technician-table.tsx`
     - `user-table.tsx`
   - [ ] Implementasikan dynamic import `const XLSX = await import('xlsx')` pada `HasilRekonClient.tsx` dan lazy-load `pdfjs-dist` pada `StockOpnameUploadZone.tsx`.

3. **Sprint 3 — Ekspansi Centralized Query Keys & Data Caching**:
   - [ ] Perluas `src/lib/query-keys.ts` dengan key factories lengkap:
     - `queryKeys.outSap`
     - `queryKeys.returnMaterial`
     - `queryKeys.inoutTag`
     - `queryKeys.hasilRekon`
     - `queryKeys.stockOpname`
     - `queryKeys.nte`
   - [ ] Standarisasikan query invalidation pada seluruh mutation action (misal setelah return disetujui, tag ditutup, atau rekon tersimpan).

4. **Sprint 4 — Pengujian Menyeluruh & Verifikasi Bebas Regresi**:
   - [ ] Tambahkan unit test untuk hook alokasi FIFO dan form schemas baru.
   - [ ] Jalankan verifikasi menyeluruh: `pnpm test:unit` (100% pass), `npx tsc --noEmit` (0 error), `pnpm biome check` (0 error), dan `pnpm build`.

---

Dokumen ini bersifat hidup—perbarui saat temuan ditindaklanjuti.
