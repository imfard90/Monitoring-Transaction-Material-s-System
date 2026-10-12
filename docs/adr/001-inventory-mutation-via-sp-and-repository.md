# ADR-001: Delegasi Mutasi Transaksi Inventory ke Stored Procedure & Repository Pattern

- **Status**: Accepted
- **Tanggal**: 2026-10-12
- **Pengusul**: Planner / Architect & AI Agent
- **Komponen Terdampak**: `src/lib/repositories/inventory.repository.ts`, `src/lib/db/migrations/021_create_sp_create_out_sap.sql`, Server Actions (`out-sap`, `rekon-intech`, `rekon-lensa`, `hasil-rekon`, `inout-tag`)

## 1. Konteks (Context)
Sebelumnya, sebagian mutasi inventaris (seperti pembuatan transaksi Out SAP, penomoran sequence transaksi, alokasi item detail, dan pengurangan saldo stok) dilakukan secara manual di lapisan aplikasi Next.js (TypeScript) dengan beberapa raw SQL query. 

Hal ini menimbulkan risiko:
1. Potensi race condition pada kalkulasi nomor transaksi sequence concurrent jika tidak menggunakan database sequence lock.
2. Pelanggaran aturan inti `AGENTS.md` §1.2 (*"Operasi inventory kritis wajib via stored procedure/function di schema inventory"*).
3. Server Actions memanggil query Kysely mentah/inline alih-alih melalui Repository Pattern yang konsisten (`AGENTS.md` §1.3).

## 2. Keputusan (Decision)
1. **Pindahkan Logika Mutasi ke Stored Procedure**:
   - Dibuat migrasi `021_create_sp_create_out_sap.sql` yang mendefinisikan `inventory.sp_create_out_sap`.
   - Menggunakan `nextval('inventory.trx_out_seq')` untuk sequence transaksi yang aman dan atomik.
   - Mengunci dan memperbarui saldo stok item dalam transaksi database atomik.
2. **Standardisasi Akses via Singleton Repository**:
   - Diekspor singleton `inventoryRepository` dari `src/lib/repositories/inventory.repository.ts`.
   - Seluruh Server Actions transaksi (`out-sap`, `rekon-intech`, `rekon-lensa`, `hasil-rekon`, `inout-tag`) dialihkan untuk memanggil metode terpusat pada repository ini.
3. **Pengujian Unit Tanpa Ketergantungan DB**:
   - Menambahkan harness unit test berbasis mock Kysely client (`tests/unit/inventory-repository.test.ts`, `tests/unit/out-sap-actions.test.ts`, `tests/unit/rekon-intech-actions.test.ts`) untuk memastikan ketahanan kode.

## 3. Konsekuensi (Consequences)

### Positif
- **Integritas Transaksi Atomik**: Penomoran dan pengurangan stok dijamin atomik oleh PostgreSQL, mencegah data korup atau race condition.
- **Konsistensi Kode (DRY & Repository Pattern)**: Server action menjadi sangat ramping (*thin controllers*), berfokus pada autentikasi sesi dan validasi skema Zod.
- **Kemudahan Pengujian**: Mocking pada unit test menjadi lebih terstruktur dengan mengisolasi instance repository.

### Kompromi / Trade-off
- Setiap perubahan skema/parameter transaksi inventaris kini memerlukan pembaruan ganda: migrasi SQL untuk Stored Procedure dan pembaruan interface TypeScript di `inventory.repository.ts`.

## 4. Alternatif yang Dipertimbangkan
- **Multi-query Kysely Transaction di Server Action**: Ditolak karena menyebarkan aturan bisnis domain di banyak file server action dan melanggar aturan P0 `AGENTS.md` §1.2.
