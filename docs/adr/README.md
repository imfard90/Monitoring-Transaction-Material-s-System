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
| [ADR-001](./001-inventory-mutation-via-sp-and-repository.md) | 2026-10-12 | Inventory Mutation via SP & Repository | Accepted |
| [ADR-002](./002_nte_stored_procedures_and_warehouse_mapping.md) | 2026-10-12 | NTE Stored Procedures and Warehouse Mapping | Accepted |
| [ADR-003](./003-agent-skills-adoption.md) | 2026-10-22 | Agent Skills Adoption from External Repositories | Accepted |
| [ADR-004](./004-codebase-memory-mcp.md) | 2026-10-22 | Codebase Memory MCP Adoption | Accepted |