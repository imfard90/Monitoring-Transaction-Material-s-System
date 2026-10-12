# ESM Migration Plan — MTMS

> Tanggal dibuat: 2026-10-12
> Status: **Proposed** — menunggu persetujuan sebelum eksekusi

## 0. Ringkasan (Executive Summary)

MTMS saat ini menggunakan **hybrid CJS/ESM**: `package.json` tanpa `"type"` field (default CJS), tetapi **seluruh kode sumber sudah ESM** (`import`/`export`). Next.js sebagai bundler menjembatani perbedaan ini, namun muncul:
- **1 warning blocking** (Vitest tidak bisa membedakan ESM vs CJS config)
- **116 lint warnings** Biome (10 fixable auto-fix, sisanya perlu keputusan manual)
- **6 file besar** (>300 baris) yang melanggar batas soft 800-line MTMS dan perlu dimodularisasi
- **4 file eksperimental** di `tmp/` yang perlu dihapus

---

## 1. Fase 1 — Fondasi ESM Murni (Foundation)

### Task 1.1: Aktifkan `"type": "module"` di `package.json`
- **File**: `package.json`
- **Aksi**: Tambahkan `"type": "module"` di root object
- **Risiko**: Rendah — Next.js 16 + ekosistem toolchain (Biome, Vitest, tsx) sudah fully ESM-aware
- **Verifikasi**: `node -e "console.log(import.meta.url)"` harus jalan tanpa error

### Task 1.2: Rename `vitest.config.ts` → `vitest.config.mts`
- **File**: `vitest.config.ts` → `vitest.config.mts`
- **Aksi**: Rename extension, update import agar sesuai ESM (sudah compliant)
- **Alasan**: `.mts` = TypeScript-as-ESM; menghilangkan warning `configLoader: 'native'`
- **Risiko**: Rendah — Vitest 5+ natively supports `.mts`

### Task 1.3: Rename `ecosystem.config.js` → `ecosystem.config.cjs`
- **File**: `ecosystem.config.js` → `ecosystem.config.cjs`
- **Aksi**: PM2 secara native membaca `.cjs` sebagai CJS; rename saja tanpa ubah isi
- **Alasan**: File ini pakai `module.exports` (CJS), harus tetap CJS
- **Risiko**: Rendah — PM2 mendukung `.cjs`

### Task 1.4: Hapus file eksperimental di `tmp/`
- **File dihapus**:
  - `tmp/inspect-wo-ui.mjs`
  - `tmp/pure-pdf-extractor.mjs`
  - `tmp/run-experiment.mjs`
  - `tmp/test-pdf-parse.mjs`
- **Total**: 4 file
- **Risiko**: Rendah — confirmed eksperimental, bukan bagian aplikasi

### Task 1.5: Update `biome.json` includes
- **File**: `biome.json`
- **Aksi**: Tambahkan pola `*.mts`, `*.cts`, `*.mjs`, `*.cjs` ke array `includes`
- **Risiko**: Rendah

---

## 2. Fase 2 — Cleanup 116 Lint Warnings

> Breakdown warning: 10 auto-fix · 10 `noExplicitAny` · 96 non-fixable (style, suspicious, correctness, a11y)

### Task 2.1: Auto-fix 10 warnings (Biome `pnpm format`)
- **Command**: `pnpm format`
- **Files & fixes**:

| File | Line | Warning | Fix |
|------|------|---------|-----|
| `src/app/(DashboardLayout)/apps/hasil-rekon/_components/ExportRekonModal.tsx` | 3 | `noUnusedImports` | Hapus `{ Calendar, FileSpreadsheet, Info }` |
| `src/app/(DashboardLayout)/apps/inout-tag/_actions/tag-commands.ts` | 3 | `noUnusedImports` | Hapus unused import |
| `src/app/(DashboardLayout)/apps/inout-tag/_actions/tag-commands.ts` | 249 | `useOptionalChain` | `x && x.y` → `x?.y` |
| `src/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagClient.tsx` | 90–93 | `noNegationElse` | Invert ternary |
| `src/app/(DashboardLayout)/apps/inout-tag/_components/InOutTagClient.tsx` | 4 | `noUnusedImports` | Hapus `{ useRouter }` |
| `src/app/(DashboardLayout)/apps/out-material/_components/OutMaterialClient.tsx` | 73 | `noNegationElse` | Invert ternary |
| `tests/unit/tag-authorization.test.ts` | 59 | `noUnusedFunctionParameters` | `_key` prefix |

- **Risiko**: Rendah — semua fixable oleh Biome

### Task 2.2: Tangani 10 `noExplicitAny` (Prioritas Tinggi)
- **Strategy**: Ganti `any` → `unknown` + type narrowing, atau type parameter eksplisit
- **Files & approach**:

| File | Line | Konteks | Approach |
|------|------|---------|----------|
| `dashboard-actions.ts` | 79 | `warehouseIds as any` | Definisikan `WarehouseIdArray = number[]`, atau cast ke `number[]` |
| `rekon-actions.ts` | 195 | `any[]` untuk whereConditions | Gunakan `ExpressionOrFactory<...>[]` dari Kysely |
| `rekon-actions.ts` | 322 | `r: any` dalam `.map()` | Definisikan interface row type |
| `rekon-actions.ts` | 386 | `w: any` dalam `.map()` | `whs.map((w: WarehouseRow) => w.name)` |
| `rekon-actions.ts` | 387 | `m: any` dalam `.map()` | `mats.map((m: MaterialRow) => m.code)` |
| `rekon-export-actions.ts` | 67 | `any[]` untuk whereConditions | Sama — `ExpressionOrFactory<...>[]` |
| `out-lensa-commands.ts` | 62 | `asyncPool(array: any[], ...)` | Ganti `any[]` → `unknown[]` + generics |
| `out-lensa-commands.ts` | 62 | `iteratorFn(item: any)` | Ganti `item: unknown` |
| `out-lensa-commands.ts` | 62 | return type `Promise<any>[]` | `Promise<unknown>[]` |
| `tag-authorization.test.ts` | 60 | `res: any` | Definisikan mock result type |

- **Risiko**: Rendah-Medium — perubahan type-safe, tidak mengubah runtime behavior

### Task 2.3: Sisa 96 warnings (non-fixable, perlu keputusan)
- **Breakdown**:

| Kategori | Count | Tindakan |
|----------|-------|----------|
| `suspicious` | ~10 | Sisanya perlu dicek satu-per-satu |
| `correctness` (unused vars/params) | 4 | Perlu cek satu-per-satu |
| `style` (whitespace, formatting) | ~5 | Perlu cek satu-per-satu |
| `useExhaustiveDependencies` | ? | Perlu dicek detail |

- **Tindakan**: Untuk setiap warning non-auto-fix, keputusan ada di developer:
  - Jika **asli perlu diperbaiki** → fix manual sesuai konteks
  - Jika **false positive** → tambahkan `// biome-ignore` dengan alasan
  - Jika **butuh diskusi** → catat di `docs/esm-migration/WARNINGS_REVIEW.md`

---

## 3. Fase 3 — Modularisasi File Besar

> Aturan MTMS: batas soft **800 baris** per source file. File di bawah 400 baris tidak urgent untuk dipecah.

### Task 3.1: Modularisasi `wo-lensa-actions.ts` (606 baris)
- **Path**: `src/app/(DashboardLayout)/apps/wo-lensa-ref/_actions/wo-lensa-actions.ts`
- **Rencana**: Pecah menjadi `_queries/` (read) + `_commands/` (write) + barrel re-export

### Task 3.2: Modularisasi `tag-queries.ts` (529 baris)
- **Path**: `src/app/(DashboardLayout)/apps/inout-tag/_actions/tag-queries.ts`
- **Rencana**: Pecah fungsi query per-domain

### Task 3.3: Modularisasi `dashboard-actions.ts` (484 baris)
- **Path**: `src/app/(DashboardLayout)/_actions/dashboard-actions.ts`
- **Rencana**: Pecah menjadi `_queries/` + `_actions/` + barrel re-export

### Task 3.4: Review file 300–400 baris
- File di bawah 400 baris: cek apakah ada pola jelas queries vs commands yang bisa dipisah. Jika ya, pecah; jika tidak, biarkan.

---

## 4. Fase 4 — Validasi & Dokumentasi

### Task 4.1: Verifikasi komprehensif
```bash
pnpm tsc --noEmit
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
pnpm migrate
```

### Task 4.2: Dokumentasi
- Buat ADR-002 untuk keputusan ESM migration
- Update `AGENTS.md` jika ada perubahan pola arsitektur
- Commit setiap fase secara terpisah

---

## 5. Timeline & Prioritas

| Task | Effort | Risiko | Prioritas |
|------|--------|--------|-----------|
| Fase 1 (Fondasi ESM) | Low | Low | **P1 — Lakukan duluan** |
| Fase 2.1 (Auto-fix) | Low | Very Low | **P1 — Jalankan sekarang** |
| Fase 2.2 (`noExplicitAny`) | Medium | Low-Medium | **P2 — Sebelum production** |
| Fase 2.3 (Sisa warnings) | High (96 items) | Medium | **P3 — Review 1 per 1** |
| Fase 3 (Modularisasi) | High | Medium | **P3 — Jika ada waktu luang** |
| Fase 4 (Validasi) | Low | Low | **P1 — Setelah tiap fase** |

---

## 6. Checklist Persetujuan

- [ ] Apakah **Task 1.1** (`"type": "module"`) disetujui? Next.js 16 + Vitest 5 + Biome sudah fully ESM-aware, tapi perlu verifikasi ekosistem lain (PM2 script, Redis, `pg`, `ioredis`).
- [ ] Apakah **Task 3** (Modularisasi) perlu dikerjakan sekarang atau ditunda?
- [ ] Untuk **96 warning non-fixable** — apakah menggunakan `// biome-ignore` diperbolehkan untuk false positive yang tidak bisa diperbaiki (misal Kysely query builder)?
- [ ] Apakah batas **800 baris per file** perlu diterapkan secara strict di semua file, atau cukup untuk file yang sering diubah?
