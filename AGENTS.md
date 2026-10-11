# AGENTS.md — Pedoman Kerja MTMS

> **Wajib dibaca sebelum mengubah kode.** Pedoman ini mengikat semua agen (manusia/AI) yang bekerja di repo Monitoring Transaction Material's System (MTMS). Berdasarkan hasil audit `docs/AUDIT_REPORT.md`.

## 0. Sumber Kebenaran

- **Audit & task perbaikan:** `docs/AUDIT_REPORT.md` (lihat matriks prioritas sebelum mulai tugas).
- **Kontrak database:** `src/lib/db/migrations/*.sql` + `src/lib/repositories/inventory.repository.ts`.
- **Otorisasi:** `src/lib/auth-server.ts` (`getSessionUser`, `getSessionNik`).

## 1. Prinsip Mutlak

### 1.1 Otorisasi Server Action (P0)

- **Setiap** server action yang membaca/menulis data domain **wajib** memanggil `getSessionUser()`/`getSessionNik()` di awal.
- Aksi baca berdasarkan ID (`headerId`, `sap_out_id`, dll) **wajib** memvalidasi kepemilikan: untuk Staff, cek `warehouseIds`/PIC; untuk non-Staff, cek peran admin/supervisor.
- **Dilarang fail-open**: jika sesi invalid, lempar `errors.auth()`/`AuthorizationError`. Jangan return `true`/data kosong sebagai "aman".
- Aksi manajemen (`management/*`) **wajib** cek peran admin eksplisit, bukan hanya `!isStaff`.

### 1.2 Business Rules di Database (P0)

- Operasi inventory kritis (mutasi, rekon, return, edit qty) **wajib** via stored procedure/function di schema `inventory`.
- **Dilarang** menulis logika bisnis kuantitas/sequence/auto-close di app layer.
- `id_trx` **wajib** dari sequence database (`nextval`), bukan `COUNT(*)`.
- Validasi `qty_used <= qty_req` wajib di SP dengan `FOR UPDATE` + `RAISE EXCEPTION`.
- Setiap SP baru menyertakan: validasi input, lock baris, atomic update, audit movement, auto-close (jika relevan).

### 1.3 Akses Data via Repository (P1)

- Semua pemanggilan SP dari kode **wajib** melalui `src/lib/repositories/*.repository.ts`.
- **Dilarang** `sql\`CALL inventory.sp_*\`` langsung di server action.
- Repository **wajib** sinkron dengan signature SP aktif. Saat mengubah SP, perbarui repository + migrasi.

### 1.4 Migrasi Database (P0)

- Gunakan migration runner yang melacak versi (tabel `migrations`/`schema_migrations`).
- Penomoran migrasi **unik** dan berurutan; tidak boleh dua file nomor sama.
- Runner **wajib** `process.exit(1)` saat gagal.
- Setiap migrasi bersifat idempoten (`CREATE OR REPLACE`, `IF NOT EXISTS`) kecuali perlu migrasi data; dokumentasikan rollback.

### 1.5 External REST API & API Key (P0)

- **Autentikasi & Otorisasi:** Setiap endpoint publik/eksternal (`src/app/api/v1/...`) **wajib** memanggil `authenticateApiRequest(req)` dari `@/lib/security/api-auth` di baris pertama handler.
- **Hashing API Key:** Format key adalah `mtms_live_<64-hex>`. Plaintext key hanya ditampilkan **satu kali** saat dibuat di User Profile. Kolom `auth.user.api_key` **hanya** menyimpan hash SHA-256 (`hashApiKey()` dari `@/lib/security/api-key`). **Dilarang keras** menyimpan atau mencatat plaintext key di log.
- **Admin Approval Gate (`appr_api`):** Meskipun key valid, request **wajib ditolak** dengan `403 Forbidden` jika `appr_api !== true`. Pengubahan approval hanya boleh dilakukan Admin via `requireManagementAccess()` di Manajemen Pengguna.
- **Atomic Per-User Rate Limiting:** Batas request (default: 1 request / 300 detik per user) dikelola atomik di Redis via `checkAndConsumeApiRateLimit()`. Konsumsi kuota dilakukan **sebelum** verifikasi approval, sehingga request berulang yang ditolak (403) tetap menghabiskan jatah 5 menit untuk mencegah abuse. Jika rate limit terlampaui, kembalikan `429 Too Many Requests` disertai header `Retry-After: <detik>` dan properti RFC 9457 `retryAt`.
- **Scoping Akses Data:** Data yang disajikan via API wajib menerapkan scoping peran MTMS: Staff hanya melihat data gudang di mana NIK-nya terdaftar sebagai `pic_1` atau `pic_2` di `inventory.mas_wh`; Non-Staff dapat melihat seluruh gudang.
- **Kontrak Response Standar:**
  - Sukses: Gunakan `apiSuccessResponse(data, meta)` dari `@/lib/api-response` (`{ data: [...], meta: { total, timestamp } }`) dengan header `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`.
  - Error: Gunakan `problemResponse({ status, title, detail, ... })` dari `@/lib/api-response` berstandar RFC 9457 `application/problem+json`.

## 2. Alur Kerja Wajib

Sebelum menyatakan tugas selesai, pastikan:

1. **Baca `docs/AUDIT_REPORT.md`** — periksa apakah tugas berkaitan dengan temuan; selesaikan sesuai prioritas (P0 > P1 > P2 > P3).
2. **Otorisasi** — setiap server action baru/diubah memenuhi §1.1.
3. **Business rules** — perubahan logika inventory memenuhi §1.2; buat/ubah SP + migrasi jika perlu.
4. **Repository** — akses data via repository (§1.3).
5. **Validasi input** — gunakan Zod schema untuk setiap payload server action; `safeParse` di awal.
6. **Idempotency** — operasi tulis inventory menggunakan `checkAndStoreIdempotency` dengan `idemKey`.
7. **Error handling** — gunakan `AppError`/subkelas dari `src/lib/errors.ts`; action return `{ success, data?, error? }`; gunakan `toActionResult()` wrapper (P2-M4) untuk standar error handling otomatis; **tidak** `console.error` di server (gunakan `actionLogger`/`securityLogger`).
8. **Logging** — redact field spesifik (`password`, `token`, `authorization`), bukan seluruh `err`/`stack`.
9. **Tes** — harness vitest sudah disetup (P1-Q1). Unit test di `tests/unit/` (mock, no DB); integration test di `tests/integration/` (read-only, butuh `DATABASE_URL`, auto-skip jika unset). Untuk perubahan SP/business rule, tambahkan integration test verifikasi objek. Untuk perubahan server action authz, tambahkan unit test positif/negatif (mock `@/lib/auth-server` via `tests/helpers/mock-auth.ts`).
10. **Type-check & lint** — `npx tsc --noEmit` dan `npx biome lint .` harus lolos sebelum commit.
11. **Rate limiting** — gunakan `lib/rate-limit.ts` (unified, P2-S3); dua signature: `rateLimit(key, {limit, windowMs})` atau `rateLimit(identifier, limit, windowSec)`.
12. **Action file structure** — file action besar (>400 baris) dipecah jadi `*-queries.ts` (read) + `*-commands.ts` (write, `'use server'`) + barrel re-export (P2-M2). Lihat `tag-actions.ts`/`out-lensa-actions.ts` sebagai pola.
13. **Dashboard queries** — semua query list/dashboard harus punya `.limit()` + `.orderBy()` eksplisit (P2-P1).
14. **Logging redaction** — redact field spesifik (`password`, `token`, `authorization`, `*.secret`, `cookies`), bukan seluruh `err`/`stack` (P3-Q2).
15. **Server logging** — tidak ada `console.*` di server code; gunakan `actionLogger`/`securityLogger`/`dbLogger`/`cacheLogger` dari `lib/logger.ts` (P3-Q3).
16. **Encryption keys** — gunakan `crypto.createHash('sha256').digest()` untuk derive 32-byte key dari env secret, bukan `slice(0,32)` (P3-S6).
17. **HR reference data** — gunakan `hrRepository` (`lib/repositories/hr.repository.ts`) untuk query `getTechnicians`/`getBranches`/`getTechnicianByNik`/`getMitras`; jangan duplikat query di server action (P3-M3).
18. **Presence tracking** — gunakan `SET NX EX` atomik, bukan `get`→`set` race (P3-P3).
19. **pg_cron scheduling** — jadwal cron dipisah ke `scripts/post-deploy/`; migrasi hanya membuat extension + procedure (P3-D6).
20. **Environment template** — `.env.example` wajib di-commit sebagai template; `.env` tidak boleh di-commit (P3-S5).
21. **reactStrictMode** — `true` di `next.config.mjs` (P3-Q4).
22. **External REST API endpoints** — route handler di `src/app/api/v1/*` wajib menerapkan autentikasi bearer key SHA-256, rate limiting 5 menit atomik per-user via Redis, validasi gate `appr_api`, RFC 9457 Problem Details error envelope, dan metadata success envelope (§1.5).


## 3. Aturan Kode Spesifik

### 3.1 Struktur

- Server actions: `src/app/<feature>/_actions/*.ts` dengan `'use server'` di atas.
- Read queries: pertimbangkan `src/lib/queries/*.ts` untuk dipakai ulang.
- Komponen: `src/app/<feature>/_components/*.tsx` + `src/components/ui/*` (primitif).
- Repository: `src/lib/repositories/*.repository.ts` (factory `createXRepository(db)`).
- Helpers HR umum: konsolidasi ke `src/lib/repositories/hr.repository.ts` (jangan duplikasi `getBranches`/`getTechnicians`).
- External API routes: `src/app/api/v1/<feature>/route.ts`.
- External API services: `src/lib/services/*-api.service.ts`.
- External API security & utils: `src/lib/security/api-auth.ts`, `src/lib/security/api-key.ts`, `src/lib/security/api-rate-limit.ts`, `src/lib/api-response.ts`.


### 3.2 Keamanan

- Jangan hardcode secret; gunakan env + `.env.example` untuk referensi.
- `MFA_ENCRYPTION_SECRET` minimal 32 byte; gunakan AES-256-GCM; jangan `slice(0,32)`.
- Reset password wajib verifikasi token via Better Auth (jangan TODO/dummy).
- Rate limiter: gunakan satu modul (`src/lib/security/rate-limit.ts`); hapus `src/lib/rate-limit.ts` setelah migrasi.
- Middleware `proxy.ts` hanya untuk UX redirect, bukan otorisasi data.

### 3.3 Database

- Schema: `inventory` (transaksi/stok), `hr` (karyawan/teknisi), `auth` (Better Auth).
- Indeks wajib pada kolom filter: `warehouse_id`, `header_id`, `end_status`, `nik_teknisi`, `created_at`, `request_time`.
- Pagination default (`LIMIT`/`OFFSET`) pada query list dashboard.
- `SECURITY INVOKER` default; hanya gunakan `SECURITY DEFINER` dengan justifikasi tertulis.

### 3.4 Komponen/UI

- Gunakan primitif `src/components/ui/*` (Radix-based).
- State server via React Query/TanStack Table; jangan simpan token/password di `localStorage`.
- Service worker (`src/sw.ts`) hanya cache aset statis; jangan cache response transaksi sensitif.
- Saat membuat/memperbaiki UI/UX, ikuti juga skill `.agents/skills/premium-ui-ux-builder/SKILL.md` (sistem desain, aksesibilitas, state UI, motion, checklist UI premium). Pada konflik, otorisasi/business rules di `AGENTS.md` lebih tinggi.

## 4. Definisi Selesai (Definition of Done)

- [ ] Otorisasi sesuai §1.1.
- [ ] Business rules di SP (jika inventory) sesuai §1.2.
- [ ] Repository dipakai sesuai §1.3.
- [ ] Migrasi terlacak + idempoten.
- [ ] Zod validation untuk payload.
- [ ] Idempotency untuk tulis.
- [ ] Error handling terstruktur + logger.
- [ ] Tes minimal untuk SP/authz baru.
- [ ] `tsc` + `biome` lolos.
- [ ] Untuk perubahan UI: checklist UI di `premium-ui-ux-builder/SKILL.md` §4 terpenuhi (primitif, token tema, responsif, dark mode, a11y, state UI lengkap).
- [ ] External REST API sesuai standar §1.5 (jika membuat/mengubah endpoint publik).

- [ ] `docs/AUDIT_REPORT.md` diperbarui status temuan terkait.

## 5. Saat Ragu

Jika tugas menyentuh area berisiko tinggi (otorisasi, mutasi stok, migrasi, kredensial) dan tidak yakin:
1. **Jangan menebak**. Baca `docs/AUDIT_REPORT.md` dan kontrak SP.
2. Tanyakan pemilik produk/database.
3. Dokumentasikan asumsi di commit/PR.
