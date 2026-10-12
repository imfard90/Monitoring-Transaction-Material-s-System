# Architecture Decision Records (ADR) — MTMS

Dokumen ini mencatat keputusan arsitektural penting (Architecture Decision Records) di sistem Monitoring Transaction Material's System (MTMS).

## Tujuan
1. Menjaga konteks teknis permanen di dalam Git sehingga AI agen dan tim dapat langsung memahami alasan di balik suatu keputusan desain tanpa harus menebak.
2. Mempercepat proses vibecoding: keputusan berisiko tinggi atau sulit dibalik terdokumentasi rapi dalam format ringkas.

## Aturan Penggunaan (Micro-ADR)
- **Kapan Wajib Membuat ADR:**
  - Perubahan model otorisasi atau autentikasi sistem.
  - Perubahan kontrak arsitektur basis data, stored procedure kritis, atau pola migrasi.
  - Penambahan pustaka eksternal/teknologi baru yang berdampak sistemik lintas modul (misal: Redis caching layer, worker queue).
  - Keputusan desain yang mahal atau berisiko tinggi jika dibalik di kemudian hari.
- **Kapan DILARANG Membuat ADR:**
  - Perbaikan bug fungsional harian.
  - Pembuatan form/komponen UI dashboard standar.
  - Penambahan unit test atau penyesuaian minor styling.

## Format Penomoran
Gunakan format `NNN-judul-keputusan.md` (contoh: `001-inventory-mutation-via-sp-and-repository.md`).

## Daftar Keputusan (ADR Register)

| ID | Tanggal | Judul Keputusan | Status |
|---|---|---|---|
| [ADR-001](./001-inventory-mutation-via-sp-and-repository.md) | 2026-10-12 | Delegasi Mutasi Transaksi Inventory ke Stored Procedure & Repository Pattern | Accepted |
