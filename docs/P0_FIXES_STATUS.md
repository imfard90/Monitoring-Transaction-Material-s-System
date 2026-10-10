# P0 Audit Fixes — Execution Status

> Update dokumentasi progress eksekusi P0 audit fixes pada MTMS (Monitoring Transaction Material's System).

## Status: P0 + P1 + P2 Selesai ✅

### Verifikasi
```
npx tsc --noEmit          → ✅ clean (0 errors)
npx biome lint            → ✅ clean (0 errors)
migrations/               → ✅ no duplicate prefixes (001–014, sequential)
npx tsx run-migration.ts  → ✅ 14/14 migrations applied (001–014 tracked in _migration_log)
npx vitest run            → ✅ 44/44 tests passed (34 unit + 10 integration)
```

---

## P0 Fixes (Critical)

### S1 — Server Action Authorization ✅
**Masalah:** Server actions tanpa cek session/role; `getRekonEditData` sama sekali tanpa auth check; `management/*` hanya cek `!isStaff` (Teknisi bisa kelola user); `checkIsStaff` fail-open.

**Perbaikan:**
| File | Perubahan |
|---|---|
| `src/lib/auth-server.ts` | Tambah `requireManagementAccess()` — fail-closed, blocks `Staff` + `Teknisi` |
| `management/users/actions.ts` | `getUsers`, `toggleUserStatus`, `deleteUser` → `requireManagementAccess()` |
| `management/technician/actions.ts` | `getTechnicians`, `getBranches`, `getMitras`, `toggleTechnicianStatus`, `upsertTechnician` → `requireManagementAccess()` |
| `edit-rekon-actions.ts` | `getRekonEditData`, `submitEditRekon` → `getSessionUser()` + warehouse scoping |
| `out-sap-actions.ts` | `getOutSapItemsByHeaderId`, `getTechnicianByNik` → `getSessionUser()` + warehouse filter |
| `return-actions.ts` | `getSapOutItemsForReturn` → `getSessionUser()` + warehouse filter |

### S2 — Fail-open `checkIsStaff` ✅
**Masalah:** `checkIsStaff()` catch error → return `true` (fail-open).

**Perbaikan:** Sudah di-address sebagai bagian S1. `checkIsStaff` sekarang documented sebagai **UI-only** (BUKAN kontrol keamanan), fail-closed (return `true` = hide menus on error). Semua guard keamanan sebenarnya menggunakan `requireManagementAccess()` / `getSessionUser()` yang melempar `AuthorizationError` pada sesi invalid.

### D1 — Rekon Business Logic in SP ✅
**Masalah:** `submitRekonIntech` melakukan insert header, loop items, update `sap_out_items`, call `sp_record_material_used`, check auto-close — semua manual di app layer. Tidak atomic.

**Perbaikan:**
| File | Perubahan |
|---|---|
| `migrations/012_create_sp_submit_rekon_intech.sql` | `CREATE OR REPLACE PROCEDURE sp_submit_rekon_intech(...)` — menerima JSON items, `FOR UPDATE` locks, validasi qty, insert header+items, update `qty_used`, call `sp_record_material_used`, auto-close |
| `rekon-intech/_actions/rekon-actions.ts` | Hapus ~60 baris manual logic → single `CALL inventory.sp_submit_rekon_intech(...)` |
| `lib/repositories/inventory.repository.ts` | Tambah `submitRekonIntech()` wrapper (type-safe) |

**Catatan:** Rekon Lensa sudah menggunakan `sp_record_rekon_lensa_v2` (migrasi 006) yang memiliki FIFO + auto-close + validasi qty di SP. Repository `recordRekonLensa()` signature diperbaiki dari 3-param (drift) → 10-param matching SP.

### D2 — `id_trx` Race Condition ✅
**Masalah:** `id_trx` format `TRX-USED-...-YYMM####` dengan `####` dari `SELECT COUNT(*)` — race condition pada concurrency, collision pada delete/rollback.

**Perbaikan:**
| File | Perubahan |
|---|---|
| `migrations/011_create_trx_used_seq.sql` | 3 sequences: `trx_used_seq`, `trx_used_lensa_seq`, `trx_out_seq` (`NO CYCLE`, `MAXVALUE 9999`) |
| `rekon-actions.ts` | `COUNT(*)+1` → `nextval('inventory.trx_used_seq')` |
| `rekon-lensa-actions.ts` | `COUNT(*)+1` → `nextval('inventory.trx_used_lensa_seq')` |
| `out-sap-actions.ts` | `COUNT(*)+1` → `nextval('inventory.trx_out_seq')` |

### D4 — Migration Runner + Duplicate 009 ✅
**Masalah:** `run-migration.ts` hardcode single file, tidak `process.exit(1)` on failure; dua file dengan prefix `009_`.

**Perbaikan:**
| File | Perubahan |
|---|---|
| `run-migration.ts` | Full rewrite: baca semua `*.sql` sorted lexicographically, tracking via `inventory._migration_log`, `BEGIN/COMMIT/ROLLBACK` per file, `process.exit(1)` on failure |
| `migrations/009_add_rekon_check_to_wo_lensa.sql` | Rename → `010_add_rekon_check_to_wo_lensa.sql` |

---

## P1 Fixes (High Priority)

### M1 — Repository Drift ✅
**Masalah:** `inventory.repository.ts` `updateInOutTag` signature 5-param, SP `009` menerima 4-param. `recordRekonLensa` signature 3-param, SP `006` menerima 10-param.

**Perbaikan:**
| File | Perubahan |
|---|---|
| `inventory.repository.ts` | `updateInOutTag`: hapus `idemKey` param, ganti `material_id` → `designator_id` (matching SP `009`) |
| `inventory.repository.ts` | `recordRekonLensa`: 3-param → 10-param (matching SP `006`: `idTrx, idPemakaian, woNumber, woType, nikTeknisi, nameGudang, nameSa, notes, createdBy, materials`) |
| `inventory.repository.ts` | Tambah `submitRekonIntech()` wrapper untuk SP `012` |

**Catatan:** App actions (`tag-actions.ts`, `rekon-lensa-actions.ts`) sudah memanggil SP langsung dengan signature yang benar. Repository wrappers diperbaiki untuk konsistensi kontrak type-safe.

### D5 — Duplicate `sp_create_return_request` ✅
**Masalah:** Migration 004 membuat `PROCEDURE sp_create_return_request` (per-item), migration 007 membuat `FUNCTION sp_create_return_request` (header+loop). Nama sama untuk PROCEDURE dan FUNCTION → konflik/kebingungan.

**Perbaikan:**
| File | Perubahan |
|---|---|
| `migrations/013_resolve_duplicate_return_request.sql` | DROP old PROCEDURE → CREATE `sp_insert_return_item` (rename); recreate FUNCTION `sp_create_return_request` dengan internal CALL ke `sp_insert_return_item` |
| `return-actions.ts` | Perbaiki alias `as header_id` → `as id_trx` (FUNCTION returns `v_id_trx` string, bukan `header_id` BIGINT) |

---
## P1 Fixes

### Q1 — Test Harness Setup ✅
**Masalah:** Tidak ada tes otomatis sama sekali; regresi bisnis kritis tidak terdeteksi.

**Perbaikan:** Setup vitest dengan dua project: `unit` (mock, no DB) dan `integration` (live DB, read-only).

| File | Perubahan |
|---|---|
| `package.json` | Tambah devDeps `vitest`, `@vitest/coverage-v8`; scripts `test`, `test:unit`, `test:integration`, `test:coverage` |
| `vitest.config.ts` | **New** — dua projects: `unit` (node env, `tests/unit/**`) + `integration` (node env, `tests/integration/**`, skip jika `DATABASE_URL` unset) |
| `tests/helpers/mock-auth.ts` | **New** — mock `getSessionUser`/`getSessionNik`/`requireManagementAccess` dengan stub peran (Admin/Staff/Teknisi/Supervisor) |
| `tests/helpers/db.ts` | **New** — pg Pool helper, `query`/`queryOne`/`describeIfDb` (read-only, safe for staging) |
| `tests/unit/auth-server.test.ts` | **New** — 13 tes: `getSessionNik` (3), `getSessionUser` (4), `requireManagementAccess` (6: blocks Staff/Teknisi/null, fail-closed on error, allows Admin/Supervisor) |
| `tests/unit/errors.test.ts` | **New** — 21 tes: error class hierarchy (8), `errors` factory (6), `errorHandler.handle` (2), `withActionErrorHandling` (2), `withErrorHandling` (1), `parseApiError` (2) |
| `tests/integration/migrations.test.ts` | **New** — 10 tes: migration log (3), sequences D2 (4), SP D1+D5 (3). Auto-skip jika `DATABASE_URL` unset. **Gate** untuk verifikasi post-`run-migration.ts` |
| `tsconfig.json` | Tambah `types: ["vitest/globals", "node"]`, bump target ES2017→ES2020 (BigInt literals) |
| `biome.json` | Override `tests/**` + `vitest.config.ts`: `noExplicitAny`/`noConsole` off |
| `.gitignore` | Tambah `.vitest-cache/` |

**Cara menjalankan:**
```bash
pnpm test              # semua (unit + integration jika DATABASE_URL set)
pnpm test:unit         # unit saja (fast, no DB)
pnpm test:integration  # integration saja (butuh DATABASE_URL)
pnpm test:coverage     # dengan coverage report
```

**Hasil saat ini:**
- ✅ `pnpm test:unit` → 34 passed (0 failed)
- ✅ `pnpm test:integration` → 10 passed (0 failed) — setelah `npx tsx run-migration.ts` dijalankan, semua objek DB tersedia

---



## Migrasi Database — Urutan Eksekusi

| # | File | Status |
|---|---|---|
| 001 | `add_pic_to_mas_wh.sql` | Existing |
| 002 | `add_stock_policy.sql` | Existing |
| 003 | `setup_pg_cron_stock_policy.sql` | Existing |
| 004 | `improve_transaction_sps.sql` | Existing |
| 005 | `sp_record_material_used_lensa.sql` | Existing |
| 006 | `rekon_lensa_v2.sql` | Existing |
| 007 | `create_return_request_func.sql` | Existing |
| 008 | `add_formatted_date_to_wo_lensa.sql` | Existing |
| 009 | `fix_inout_tag_status.sql` | Existing |
| 010 | `add_rekon_check_to_wo_lensa.sql` | **Renamed** from 009 (D4) |
| 011 | `create_trx_used_seq.sql` | **New** (D2) |
| 012 | `create_sp_submit_rekon_intech.sql` | **New** (D1) |
| 013 | `resolve_duplicate_return_request.sql` | **New** (D5) |

**Eksekusi live:** ✅ Dijalankan — 14/14 migrations applied (001–014 tracked in `_migration_log`).

---

## Files Modified/Created Summary

### Modified (TS)
- `src/lib/auth-server.ts` — `requireManagementAccess()` helper
- `src/lib/repositories/inventory.repository.ts` — fix `updateInOutTag` (5→4 param), fix `recordRekonLensa` (3→10 param), add `submitRekonIntech()` wrapper
- `src/app/(DashboardLayout)/management/users/actions.ts` — authorization guards
- `src/app/(DashboardLayout)/management/technician/actions.ts` — authorization guards
- `src/app/(DashboardLayout)/apps/hasil-rekon/_actions/edit-rekon-actions.ts` — warehouse scoping
- `src/app/(DashboardLayout)/apps/out-sap/_actions/out-sap-actions.ts` — warehouse scoping + sequence
- `src/app/(DashboardLayout)/apps/return-material/_actions/return-actions.ts` — warehouse scoping + alias fix
- `src/app/(DashboardLayout)/apps/rekon-intech/_actions/rekon-actions.ts` — sequence + SP call
- `src/app/(DashboardLayout)/apps/rekon-lensa/_actions/rekon-lensa-actions.ts` — sequence
- `run-migration.ts` — full rewrite

### Created (SQL)
- `src/lib/db/migrations/011_create_trx_used_seq.sql`
- `src/lib/db/migrations/012_create_sp_submit_rekon_intech.sql`
- `src/lib/db/migrations/013_resolve_duplicate_return_request.sql`

### Renamed (SQL)
- `009_add_rekon_check_to_wo_lensa.sql` → `010_add_rekon_check_to_wo_lensa.sql`

---

## P2 Fixes (Medium Priority) ✅

### S3 — Consolidate rate limiter modules ✅
- Unified `lib/rate-limit.ts` with overloaded signature: `{limit, windowMs}` OR `(identifier, limit, windowSec)`.
- Deleted `lib/security/rate-limit.ts`. Updated import in `api/presence/route.ts`.

### S4 — Reset password token verification ✅
- Removed dummy `setTimeout` in `reset-password/page.tsx`.
- Token verified server-side by Better Auth `resetPassword()` against `verification` table.

### D3 — WO validation exact match ✅
- Changed `.where('wo_number', 'like', \`%${woNumber}%\`)` to `.where('wo_number', '=', woNumber)`.
- Added index `idx_wo_lensa_header_wo_number` (migration 014).

### M2 — Split large action files ✅
- `tag-actions.ts` (600 lines) → barrel + `tag-queries.ts` (7 read functions) + `tag-commands.ts` (4 write functions).
- `out-lensa-actions.ts` (568 lines) → barrel + `out-lensa-queries.ts` (3 read) + `out-lensa-commands.ts` (3 write).
- Import paths unchanged for all consumers.

### M4 — Standard error handling + `toActionResult` ✅
- Added `ActionResult<TData>` type and `toActionResult()` wrapper to `lib/errors.ts`.
- Pattern: action returns `{ success: true, data }` or `{ success: false, error: string }`.
- AppError subclasses pass message to client; unexpected errors get generic message in prod.

### P1 (DB) — Dashboard pagination + indexes ✅
- Added `.limit(200)` to `getOutSaps`, `.limit(500)` + `.orderBy()` to `getInOutTags` and `getHasilRekon`.
- Migration 014: 13 indexes on `warehouse_id`, `end_status`, `request_time`, `created_at` across header tables.

---

## Remaining P3 Items (Not Yet Addressed)

_All P3 items addressed in Sprint P3 — see below._

## P3 Items Completed
| Item | Pri | Status | Notes |
|------|-----|--------|-------|
| Q2 | P3 | ✅ | Logger redact paths: `password`, `token`, `authorization`, `*.secret`, `cookies` (field-specific, not whole `err`/`stack`) |
| Q3 | P3 | ✅ | `console.*` → `actionLogger`/`securityLogger` in `idempotency.ts`, `hofs.ts`, `lensa-scraper.ts`, `instrumentation.ts`, `auth-actions.ts`, `out-lensa-commands.ts`, `wo-lensa-actions.ts` |
| S5 | P3 | ✅ | `.env.example` created with all env vars + placeholder values |
| S6 | P3 | ✅ | `ENCRYPTION_KEY` `slice(0,32)` → `crypto.createHash('sha256').digest()` (32-byte key guaranteed) |
| D6 | P3 | ✅ | pg_cron schedule moved to `scripts/post-deploy/003_schedule_pg_cron.sql`; migration 003 only creates extension + procedure |
| M3 | P3 | ✅ | `hrRepository` (`lib/repositories/hr.repository.ts`) consolidates `getTechnicians`/`getBranches`/`getTechnicianByNik`/`getMitras` |
| P3 | P3 | ✅ | Presence route uses `SET NX EX` atomic + re-verify race-loser |
| P4 | P3 | ✅ | Dashboard cache invalidation consistent (revalidatePath/revalidateTag) |
| Q4 | P3 | ✅ | `reactStrictMode: true` |
| Q5 | P3 | ✅ | `images.unoptimized: true` evaluated — retained for intranet/non-CDN deployment |
