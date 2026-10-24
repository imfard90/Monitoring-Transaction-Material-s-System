# Audit Kepatuhan & Rekonfigurasi Agen Cline — MTMS

> **Tanggal Audit:** 12 Oktober 2026  
> **Target:** Arsitektur Agen, Skills, Rules, Modes/Roles, Workflows, Hooks, Konfigurasi MCP, dan Kepatuhan Kode MTMS  
> **Status Dokumen:** Selesai & Rencana Tindak Lanjut

---

## 1. Ringkasan Eksekutif

Audit ini mengevaluasi keselarasan antara konfigurasi AI Agent (berkas `.agents/`, `.cline/`, `AGENTS.md`, `CLINE.md`, `bispro.md`) dengan kemampuan runtime **Cline** serta kepatuhan kode sumber MTMS saat ini.

### Kesimpulan Utama
1. **Kondisi Kode MTMS:**  
   - Kompilasi TypeScript bersih (`pnpm tsc --noEmit` lolos 0 error).  
   - Seluruh 114 unit test lolos 100% (`pnpm test:unit`).  
   - Fitur keamanan mutakhir (hashing SHA-256 API Key, approval gate `appr_api`, rate limiting atomik Redis 5 menit, otorisasi sesi server action) telah terpasang dengan baik pada modul-modul kritis.  
   - Kontrak UI/UX (`src/components/ui/*`, token tema Tailwind v4, aksesibilitas keyboard dan prefers-reduced-motion) lolos validasi otomatis.
2. **Kondisi Konfigurasi AI & Agen:**  
   - **Ditemukan ketidakcocokan fundamental (Mismatches & Discrepancies):** Konfigurasi agen saat ini diwarisi dari ekosistem *Everything Claude Code (ECC)* yang dirancang untuk Claude Code CLI, bukan Cline VS Code Extension.
   - **Ghost Tooling & Ghost Syntax:** File aturan merujuk pada pemanggilan sub-agen `Agent(subagent_type: "ecc:planner")`, hooks `~/.claude/settings.json`, serta linter `Prettier` dan `ESLint` yang **tidak ada di MTMS** (MTMS menggunakan **Biome** dan **Vitest**).
   - **Klaim Dokumentasi vs Isi Disk:** `CLINE.md` mengklaim 200+ skills dan 68 agen, namun di disk hanya terdapat **44 skills**, **29 active agents** (38 agen diarsipkan), dan **6 workflows**.
   - **Cline Memerlukan Rekonfigurasi:** Ya. Perlu penyelarasan aturan, pembersihan referensi alat usang, optimalisasi workflow slash commands, dan penataan mode peran agar Cline bekerja secara presisi tanpa kebingungan konteks.

---

## 2. Matriks Inventarisasi & Diskrepansi (Konfigurasi vs Realita)

| Komponen | Klaim Dokumentasi (`CLINE.md`) | Realita di Disk | Dukungan Runtime Cline | Status Keselarasan |
|---|---|---|---|---|
| **Rules** | 29 rules di `.cline/rules/` | 27 rules aktif + 1 README + 40 di `_archive` | Mendukung (dibaca otomatis berdasarkan glob `paths:`) | ⚠️ **Parsial** (Mengandung referensi Prettier, ESLint, Jest, dan subagen ECC) |
| **Skills** | 200+ skills di `.agents/skills/` | 44 skills aktif di `.agents/skills/` | Mendukung penuh via tool `default_api:skills` | ⚠️ **Parsial** (Skills terdaftar, tapi aset json internal skill memicu error Biome) |
| **Agents** | 68 specialized agents | 29 agen aktif, 38 di `.agents/agents/_archive/` | ❌ Tidak mendukung syntax `Agent(...)` | ❌ **Misaligned** (Syntax Claude Code CLI, bukan tool bawaan Cline) |
| **Workflows** | 6 slash commands di `.cline/workflows/` | 6 berkas workflow (`commit`, `review`, `security`, dll.) | Mendukung penuh via `/command` | ⚠️ **Perlu Tuning** (Menggunakan `pnpm dlx` dan pemanggilan agen manual) |
| **Hooks** | Lifecycle hooks (`.cline/hooks/`) | Folder `.cline/hooks/` kosong / tidak ada | ❌ Cline VS Code tidak mengeksekusi hooks shell otomatis | ❌ **Misaligned** (Aturan merujuk ke Claude Code CLI `~/.claude/settings.json`) |
| **Roles / Modes** | Mode agen terstruktur | Tidak ada `.roomodes` atau custom mode file | Mode default: Plan & Act | ⚠️ **Default Only** (Belum ada mode peran khusus seperti Reviewer/Architect) |
| **MCP Servers** | PostgreSQL MCP Server | 3 server terpasang: `postgres`, `filesystem`, `context7` | Aktif dan operasional | ✅ **Sesuai & Berjalan** |

---

## 3. Hasil Audit Kepatuhan Kode Sumber MTMS

### 3.1 Kepatuhan terhadap `AGENTS.md` & `bispro.md`

| Bagian Pedoman | Persyaratan | Kondisi Nyata di Kode | Kepatuhan | Catatan Audit |
|---|---|---|---|---|
| **§1.1 Otorisasi Server Action** | Wajib `getSessionUser()` / `getSessionNik()`, validasi warehouse PIC untuk Staff, tidak boleh fail-open. | 95% server action sudah terlindungi (`inout-tag`, `out-lensa`, `wo-lensa`, `hasil-rekon`, `management`). | 🟡 **Tinggi** | Beberapa fungsi baca di `out-sap-actions.ts` (helper lookups) dan `edit-rekon-actions.ts` perlu pengetatan validasi gudang. |
| **§1.2 Business Rules di SP** | Logika stok, sequence `id_trx`, validasi `qty_used <= qty_req` wajib di database SP/function. | InOut Tag (`sp_update_inout_tag`), Rekon Lensa (`sp_record_rekon_lensa_v2`), Rekon Intech (`sp_submit_rekon_intech`), Return (`sp_insert_return_item`) sudah via SP. | 🟡 **Cukup** | `createOutSap` di `out-sap-actions.ts` menggunakan sequence `trx_out_seq` via Kysely, tetapi mutasi data masih ditulis via kode aplikasi, bukan SP khusus. |
| **§1.3 Akses via Repository** | Akses SP wajib via `src/lib/repositories/*.repository.ts`. Dilarang bypass. | `hrRepository` dipakai di `management/technician` & `out-sap`. Namun `createInventoryRepository` sama sekali **belum dipanggil** oleh server action. | 🔴 **Rendah** | Server actions langsung mengeksekusi `sql\`CALL...\`` atau Kysely query secara inline karena ketiadaan instance singleton `inventoryRepository`. |
| **§1.4 Migrasi Database** | Runner melacak migrasi di tabel database, idempoten, urut, `process.exit(1)` saat gagal. | `run-migration.ts` melacak di `inventory._migration_log` dan keluar kode 1 jika gagal. | 🟢 **Tinggi** | Ada catatan kecil pada `run-migration.ts`: penggunaan impor `fs` dan `path` tanpa protokol `node:`, serta warning `console.log`. |
| **§1.5 External REST API** | Auth SHA-256 Bearer, approval gate `appr_api`, rate limit atomik Redis 5 menit, RFC 9457 error. | `src/app/api/v1/stock/route.ts` dan pustaka pendukung (`api-auth`, `api-key`, `api-rate-limit`, `api-response`) 100% patuh. | 🟢 **Penuh** | Terverifikasi dengan 7 unit test di `tests/unit/api-auth.test.ts` & `api-stock-route.test.ts`. |
| **§3.4 UI & Desain Sistem** | Pakai primitif `src/components/ui/*`, token tema Tailwind v4, Bahasa Indonesia, aksesibilitas. | Sesuai. Komponen shared (`EmptyState`, `ErrorBoundary`, `StatusBadge`) patuh; 17 pengujian di `tests/unit/ui-ux-contract.test.ts` lolos. | 🟢 **Penuh** | Menggunakan panduan desain `ui-ux-pro-max` tanpa melanggar otorisasi domain. |

### 3.2 Kepatuhan terhadap Aturan Aktif (`.cline/rules/`)

| File Aturan | Persyaratan Kunci | Status Kode Saat Ini | Evaluasi Kepatuhan |
|---|---|---|---|
| `common-coding-style.md` | Immutability, fungsi < 50 baris, file < 800 baris. | Kode mematuhi pola immutable update. Sebagian besar file di bawah 500 baris, kecuali `database.types.ts` (1,170 baris, generated) dan `lensa-scraper.ts` (910 baris, scraper). | ✅ **Patuh** (dengan pengecualian wajar pada scraper & types) |
| `common-code-review.md` & `typescript-hooks.md` | Semua automated checks lolos sebelum merge. Larangan `console.log`. Menyarankan Prettier & ESLint. | Proyek menggunakan **Biome**. `tsc --noEmit` bersih. Terdapat warning `console.log` pada runner scripts. Biome gagal pada format recent commits dan file json pihak ketiga di `.agents/skills`. | ⚠️ **Perlu Penyesuaian Aturan** (Aturan harus diganti ke Biome) |
| `common-testing.md` & `react-testing.md` | Target cakupan 80%. RTL + Jest. | Proyek menggunakan **Vitest**, bukan Jest. Terdapat 114 unit test yang mencakup domain kritis. Estimasi cakupan baris total ~35-40% (belum mencapai 80%). | ⚠️ **Parsial** (Spesifikasi runner di aturan harus Vitest; tes bertahap diperbanyak) |
| `web-design-quality.md` & `web-coding-style.md` | Token semantik, kontras WCAG AA, `prefers-reduced-motion`, tidak ada layout-bound animations. | Sepenuhnya diterapkan di `src/app/css/globals.css` dan primitif UI. | ✅ **Patuh** |


---

## 4. Analisis Rekonfigurasi Cline

### 4.1 Mengapa Cline Membutuhkan Rekonfigurasi?
1. **Ambivalensi Perkakas Linter:**  
   Ketika Cline membaca `.cline/rules/web-hooks.md` atau `typescript-hooks.md`, agen disuruh menjalankan `pnpm prettier --write` atau `pnpm eslint --fix`. Kedua perintah ini tidak terdaftar di `package.json` dan akan gagal. Proyek MTMS menggunakan `pnpm run format` / `pnpm run lint` berbasis **Biome**.
2. **Ketiadaan Sub-Agen Tool `Agent()`:**  
   Aturan `common-agents.md` menginstruksikan penggunaan syntax `Agent(subagent_type: "ecc:planner")`. Cline VS Code tidak memiliki tool ini. Upaya memanggil agen dengan syntax tersebut akan menghasilkan error atau diabaikan.
3. **Redudansi `pnpm dlx` pada Workflows:**  
   Workflow `.cline/workflows/review.md`, `commit.md`, dan `new-page.md` menjalankan `pnpm dlx @biomejs/biome check --write .`. Mengunduh Biome via dlx pada setiap eksekusi memakan waktu, mengabaikan instalasi lokal, dan menimbulkan konflik versi skema (misal Biome CLI 2.5.14 vs skema 2.5.15).
4. **Kebocoran Pemeriksaan Biome ke `.agents/`:**  
   `biome.json` belum mengecualikan `.agents/**` dan `.archive/**`. Akibatnya, berkas JSON internal dalam third-party skills (seperti file test coverage di `ui-styling`) terdeteksi tidak terformat rapi dan menggagalkan `pnpm check`.
5. **Kekosongan Definisi Mode Peran:**  
   Meskipun terdapat 29 persona agen di `.agents/agents/`, tidak ada konfigurasi `.roomodes` atau pemetaan mode di Cline sehingga agen selalu berjalan dalam persona umum (Plan/Act) tanpa pembagian peran spesifik (Architect, Code Reviewer, Security Reviewer, Test Specialist).

---

## 5. Rencana Tindak Lanjut & Rekonfigurasi (Prioritized Action Plan)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PRIORITAS REKONFIGURASI                         │
├───────────────────┬───────────────────┬────────────────────────────────┤
│   Fase 1 (P0)     │    Fase 2 (P1)    │          Fase 3 (P2)           │
│ Penyelarasan Tool │  Workflow & Mode  │     Arsitektur Kode MTMS       │
│  & Aturan Cline   │     Optimasi      │       (Repository & SP)        │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

### Fase 1: Penyelarasan Tooling & Aturan Cline (P0 — Segera) [SELESAI]
- [x] **Sinkronisasi `biome.json`:**  
  Menambahkan pengecualian untuk `.agents`, `.archive`, `_archive`, `.cline` pada `biome.json`, sinkronisasi schema version ke 2.5.14, serta override `noConsole` untuk script migration runner.
- [x] **Koreksi Rules `.cline/rules/`:**  
  1. Mengganti seluruh instruksi `Prettier` dan `ESLint` pada `typescript-hooks.md`, `web-hooks.md`, dan `common-code-review.md` dengan instruksi **Biome** (`pnpm format`, `pnpm lint`, `pnpm check`).
  2. Mengganti referensi `Jest` pada `react-testing.md` menjadi **Vitest** dan RTL, serta Playwright untuk E2E.
  3. Memperbarui `common-agents.md` untuk menjelaskan eksekusi peran agen di Cline via persona, workflows, dan skill tool (bukan sub-agen Claude Code `Agent(...)`).
  4. Memperbarui `common-hooks.md`, `react-hooks.md`, dan `react-coding-style.md` agar konsisten dengan eksekusi Cline dan aturan linter Biome.
  5. Menyelaraskan seluruh perubahan ke `.agents/rules/`.
- [x] **Sinkronisasi Dokumentasi `CLINE.md`:**  
  Mengoreksi angka representasi menjadi 44 skills aktif, 29 agents, 27 rules aktif + 1 README, 6 workflows, dan menegaskan ketiadaan shell hooks background di Cline.
- [x] **Pembersihan Impor Node pada Runner Migrasi:**  
  Mengubah `import * as fs from 'fs'` dan `import * as path from 'path'` menjadi protokol `node:fs` dan `node:path` di `run-migration.ts`.

### Fase 2: Optimasi Workflows & Peran Mode (P1) [SELESAI]
- [x] **Optimasi Slash Commands di `.cline/workflows/`:**  
  Mengubah pemanggilan `pnpm dlx @biomejs/biome check --write .` pada `commit.md`, `review.md`, dan `new-page.md` menjadi `pnpm format` dan `pnpm lint`. Memperbarui `security.md` dengan standar verifikasi REST API §1.5 (`authenticateApiRequest`, hash SHA-256, approval gate `appr_api`, rate-limiting atomik Redis).
- [x] **Tambahkan Workflow Pelengkap:**  
  Membuat workflow baru:
  - `.cline/workflows/test.md` (`/test`): Menjalankan suite unit (`pnpm test:unit`), integrasi (`pnpm test:integration`), atau berkas spesifik dengan `pnpm tsc --noEmit`.
  - `.cline/workflows/migrate.md` (`/migrate`): Menjalankan runner migrasi (`pnpm migrate`), mengecek transaksi atomik, dan memvalidasi tipe Kysely.
  - Menambahkan script `"migrate": "tsx run-migration.ts"` di `package.json`.
- [x] **Konfigurasi Mode Peran (Custom Modes):**  
  Menyediakan konfigurasi mode peran di `.roomodes` dan panduan workspace komprehensif di `.clinerules` untuk 4 peran esensial MTMS:
  1. **Planner / Architect (`planner`):** Analisis bisnis proses (`bispro.md`), skema database, dan arsitektur fitur.
  2. **Code Builder (`builder`):** Implementasi kode Next.js, Server Actions, Kysely, Zod, dan komponen UI.
  3. **Code Reviewer (`reviewer`):** Audit tsc, Biome, otorisasi `getSessionUser`, dan verifikasi anti-fail-open.
  4. **Security & Test Specialist (`security-tester`):** Audit OWASP/API, pembuatan unit test Vitest, dan validasi rate limiting.
- [x] **Dokumentasi `CLINE.md`:**  
  Menambahkan daftar 8 workflow, contoh penggunaan `/test` dan `/migrate`, serta deskripsi 4 custom mode peran.

### Fase 3: Peningkatan Kepatuhan Kode Domain (P2) [SELESAI]
- [x] **Aktivasi Singleton `inventoryRepository`:**  
  Di `src/lib/repositories/inventory.repository.ts`, mengekspor instance default `export const inventoryRepository = createInventoryRepository(db);` dan re-export di `src/lib/repositories/index.ts`. Seluruh server action transaksi (`out-sap`, `rekon-intech`, `rekon-lensa`, `hasil-rekon`, `inout-tag`) kini memanggil repository ini alih-alih raw query/inline SP call.
- [x] **Stored Procedure untuk `createOutSap`:**  
  Membuat migrasi `021_create_sp_create_out_sap.sql` untuk memindahkan pembuatan transaksi Out SAP, sequence sequence generation (`trx_out_seq`), alokasi item, dan pengurangan stok balance ke stored procedure `inventory.sp_create_out_sap` (konsisten dengan AGENTS.md §1.2). Berhasil dieksekusi via `pnpm migrate`.
- [x] **Pembersihan Impor Node pada Runner Migrasi:**  
  Menggunakan `node:fs` dan `node:path` di `run-migration.ts` dan konfigurasi override Biome untuk script administratif telah terverifikasi.
- [x] **Peningkatan Cakupan Tes Vitest:**  
  Menambahkan suite unit test komprehensif baru: `tests/unit/inventory-repository.test.ts` (11 tests), `tests/unit/out-sap-actions.test.ts` (6 tests), dan `tests/unit/rekon-intech-actions.test.ts` (5 tests), meningkatkan total unit test menjadi 136 tests (100% passing).

---

## 6. Verifikasi & Validasi

Setelah rencana di atas dieksekusi:
1. `pnpm tsc --noEmit` tetap lulus 0 error.
2. `pnpm check` (Biome) lulus tanpa error atau peringatan pada seluruh file kerja.
3. `pnpm test:unit` lulus 100%.
4. Alur slash command (`/review`, `/commit`, `/security`) bekerja cepat dan konsisten dengan environment lokal MTMS.

