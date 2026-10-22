# Workflow Penutupan Audit Keamanan NTE

**Status global: BLOCKED / NTE tidak boleh diaktifkan** sampai seluruh gate keamanan dan validasi database lulus. Jangan jalankan migration/write database dalam workflow ini tanpa persetujuan eksplisit dan target nonproduksi yang disetujui.

## Aturan pelaksanaan

- Satu task ditutup hanya setelah kriteria penerimaan dan bukti verifikasi dicatat.
- Pertahankan perubahan working tree yang tidak terkait; jangan reset, checkout, atau staging massal.
- Migrations `026`/`027` mungkin sudah diterapkan di suatu environment. Perlakukan file tersebut sebagai immutable sampai status deployment diverifikasi; jika sudah diterapkan, buat migration forward-only baru.
- Tidak ada role/scoping fail-open. Jika akses warehouse tidak dapat dipetakan secara pasti, tolak akses.

## Task list

| ID | Task | Kriteria penerimaan | Status |
|---|---|---|---|
| NTE-00 | Baseline & inventarisasi | Catat git diff awal; daftar semua NTE pages/actions/repository/SQL/migrations; verifikasi menu dan route tetap nonaktif; baca `AGENTS.md`, `bispro-nte.md`, `docs/AUDIT_REPORT.md`. | Done: routes redirect ke `/`, NTE menu entries absent; static verification |
| NTE-01 | Session/action inventory | Semua exported server actions teridentifikasi; setiap action baca/tulis mengautentikasi di awal; exception ditolak fail-closed; tes no-session memastikan query/mutasi DB tidak terpanggil. | Partial: command mutations already authenticate; references `getNteAddresses/Items/Technicians` authenticate; expanded unauthenticated command tests pending |
| NTE-02 | Role authorization | Terapkan role sesuai `bispro-nte.md`; staff hanya operasi yang diizinkan; menu/admin-only actions menolak role lain; jangan menganggap `!isStaff` sebagai admin; tes allow/deny tiap role. | Pending |
| NTE-03 | Warehouse/address scope | Verifikasi hubungan `nte_inventory.mas_address_nte.ui_label` ↔ `inventory.mas_wh.name` terhadap schema/data read-only; petakan staff PIC secara deterministik. Tolak address tanpa mapping, scope kosong, asal/tujuan di luar scope, external/vendor untuk Staff. Tes no mapping, mapping tunggal, banyak warehouse, dan cross-scope. | Blocked: perlu kontrak dan pemeriksaan data DB read-only |
| NTE-04 | Validasi input & paging | Zod di awal setiap action; batas pagination/search/date/array size; validasi ID/SN; tanggal invalid dan range terbalik ditolak; query list punya order + limit. | Pending: existing mutations have basic Zod but no explicit bounds; several queries accept unchecked input/params; date range validation absent |
| NTE-05 | `listNteTags` parameter binding | Hilangkan SQL raw placeholder gabungan; semua nilai bind melalui Kysely, including search/date/limit/offset; tes filter tunggal/kombinasi dan injection-like values; query chạy trên DB test. | Pending |
| NTE-06 | SP atomicity & state checks | Untuk setiap SN: `SELECT ... FOR UPDATE`, validasi keberadaan/status/address/condition dan ownership sebelum update, lalu update + audit log dalam transaksi; reject duplicates/empty payload; satu SN gagal membatalkan seluruh operasi. Verifikasi kontrak call dan compile di PostgreSQL nonprod. | Blocked: migration/data contract harus diverifikasi |
| NTE-07 | Stored procedure authorization | SP tidak mempercayai `created_by`/flag scope dari caller; hak akses dikuatkan pada boundary terverifikasi (server identity/DB role atau kontrak aman lain); direct call sebagai role aplikasi tidak dapat bypass scoping. | Blocked: perlu desain identitas database yang disepakati |
| NTE-08 | Migration grants & replay safety | Pastikan tidak ada `PUBLIC` execute; revoke default/public privileges, grant minimum ke role aplikasi yang benar; sequence/schema grants minimum; cek penomoran unik, runner, migration ledger dan apakah 026/027 pernah applied. Jangan edit migration applied; gunakan migration forward-only baru. | Blocked: perlu status database/role read-only |
| NTE-09 | Tests | Unit auth/scoping/input/query-binding; integration PostgreSQL untuk prosedur transaction rollback/status/concurrency/grants. Tes integration read-only hanya untuk inspeksi; test write pada DB disposable/nonprod saja. | Pending |
| NTE-10 | Security review & verification | Review diff hanya NTE; `pnpm format` dengan target file atau Biome format scoped, `pnpm lint`, `pnpm tsc --noEmit`, tes NTE/unit; `git diff --check`; catat hasil serta batasan. | Pending |
| NTE-11 | Release gate | NTE route/menu tetap nonaktif sampai NTE-00…10 selesai, migration status terkonfirmasi, procedure/grants diuji pada nonprod, dan pemilik database menyetujui. | Blocked |

## Urutan kerja

1. Selesaikan NTE-00 dan simpan baseline; hindari perubahan file lain.
2. Tulis tes RED untuk NTE-01/02/04; implementasi auth fail-closed per action.
3. Tutup NTE-03 dengan verifikasi read-only schema/data. Jika mapping tidak pasti, keep blocked.
4. Tulis tes RED NTE-05; refactor query menjadi parameterized bindings, lalu tes.
5. Review schema dan migrations; tetapkan kontrak DB identity/authorization sebelum NTE-06/07.
6. Periksa migration ledger dan roles tanpa mutasi; pilih migration baru jika 026/027 sudah deployed.
7. Jalankan integration tests hanya pada database disposable/nonprod yang disetujui.
8. Jalankan NTE-10, review diff, perbarui audit report, lalu minta persetujuan release gate.

## Evidence log

| Tanggal | Task | Bukti/command | Hasil | Follow-up |
|---|---|---|---|---|
| 2026-10-19 | NTE-00 | `git status --short`; inspeksi NTE actions/repository/migrations | Inventaris statik selesai; working tree berisi perubahan NTE dan non-NTE sebelumnya; route/menu status belum diverifikasi; prosedur mengubah row sebelum validasi dan grants memberi EXECUTE ke PUBLIC. Tidak ada DB/migration dijalankan. | Route tetap dianggap nonaktif sampai dikonfirmasi eksplisit. |
| 2026-10-19 | NTE-01 partial | `pnpm exec vitest run --project unit tests/unit/nte-query-authorization.test.ts`; scoped Biome lint/format; `pnpm tsc --noEmit`; `git diff --check` | 15 tests pass (12 query/reference + 3 command mutation unauthenticated denials); query and command actions authenticate before repository access. | Role policy and warehouse scope remain separate gates. |
| 2026-10-19 | NTE-00/05/10 partial | inspected routes/sidebar; Kysely-bound `listNteTags` filtering; unit test, scoped lint/format, tsc, diff check | NTE routes redirect to `/`; sidebar NTE links removed; dynamic `sql.raw` filter removed. Checks pass; no DB run. | SQL compilation and integration require approved disposable DB. |
| 2026-10-19 | Release block | inspected `bispro-nte.md`, migrations 026/027, actions/repository | Role contract needs exact role list; warehouse/address mapping unverified; procedures update before validation and grant execute to PUBLIC; some actions lack bounded Zod validation; DB ledger/roles uninspected. | Keep inactive pending product/DB owner decisions, read-only DB evidence, forward migration and disposable DB tests. |
| 2026-10-19 | Migration prep | read-only PostgreSQL inspection via `.env` (target `gresik`, host `192.168.196.140`); reviewed NTE SQL and repository call signatures | `nte` legacy schema exists (6 tables); NTE migration 026/027 absent from ledger. Legacy contents and application DB role remain unverified. 026 creates `nte_inventory` without dropping legacy `nte`. 027 contained syntax, authorization, state-validation, and update-before-check issues. Replaced its executable body with a deliberate fail-closed exception before any DDL/DCL; prior definitions are commented as unapproved draft. | Do not run `pnpm migrate`: it runs all pending migrations, and 027 intentionally aborts. Review all pending migrations/ledger, verify backup/restore and legacy contents, agree DB identity + warehouse/address mapping, then create and test reviewed forward migration on approved disposable DB. No database changes were made. |
