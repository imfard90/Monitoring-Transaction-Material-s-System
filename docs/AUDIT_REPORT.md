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
| Testing | **Tidak ada suite tes ditemukan** |

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
  - `getSapOutItemsForReturn(headerId)` membaca item SAP tanpa cek kepemilikan warehouse.

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

## 6. Catatan Verifikasi

- `npx tsc --noEmit`: ✅ lolos (0 error).
- `npx biome lint .`: ✅ lolos.
- `npx next build`: ✅ lolos (semua route ter-generate).
- Migrations 001–014: ✅ sequential, no duplicate prefixes.
- `npx tsx run-migration.ts`: ✅ 14/14 applied (tracked in `inventory._migration_log`).
- `npx vitest run`: ✅ 44/44 tests passed (34 unit + 10 integration; auto-skip integration jika `DATABASE_URL` unset).
- Audit tidak menyentuh database langsung; kontrak SP diverifikasi via berkas migrasi SQL + integration test, bukan introspeksi live.

**Semua temuan audit (P0, P1, P2, P3) telah ditindaklanjuti.**

Dokumen ini bersifat hidup—perbarui saat temuan ditindaklanjuti.
