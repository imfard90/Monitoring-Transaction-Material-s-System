---
name: postgres-patterns
description: Standar acuan resmi optimasi performa PostgreSQL di MTMS mencakup 5 Pilar Skalabilitas (Prepared Statement, Indexing, Partitioning, COPY Ingestion, Replication), pola CTE berkinerja tinggi, dan arsitektur database-centric ELT. Use when designing schemas, writing/refactoring queries, troubleshooting slow queries, or implementing high-throughput data pipelines.
metadata:
  origin: MTMS-Engineering
  version: 2.0
---

# PostgreSQL Performance Optimization Standard (MTMS)

Standar acuan resmi rekayasa database PostgreSQL untuk repositori **Monitoring Transaction Material's System (MTMS)**.  
Berdasarkan hasil audit performa, benchmark empiris ELT, dan panduan skalabilitas database.

---

## 1. Prinsip Utama Skalabilitas MTMS

1. **Zero-Cost Scaling First:**
   Maksimalkan kapabilitas *single-node* PostgreSQL 18 (indeks presisi, plan caching, partisi native, streaming COPY) sebelum menambah server atau replikasi berbayar.
2. **Business Rules di Database (P0 - `AGENTS.md` §1.2):**
   Operasi mutasi inventori kritis (mutasi, rekon, retur, penyesuaian qty) **wajib** via stored procedure/function di skema `inventory`. Logika bisnis tidak boleh ditulis di lapisan aplikasi Node.js.
3. **Prioritas Introspeksi via MCP Tool (`AGENTS.md` §1.7):**
   Gunakan tool MCP `postgres__query` untuk memeriksa skema, struktur indeks, dan query plan (`EXPLAIN ANALYZE`). Dilarang membuat skrip ad-hoc Node/cURL untuk membaca database.

---

## 2. Lima Pilar Optimasi Database (5 Pillars)

```
                       5 PILAR OPTIMASI DATABASE MTMS
┌──────────────────────────────────────┬──────────────────────────────────────┐
│  Pilar 1: PREPARED STATEMENT         │  Pilar 2: STRATEGIC INDEXING         │
│  - Array binding = ANY($1)           │  - B-Tree Composite (Equality first) │
│  - UNNEST($1, $2) Bulk Ingest        │  - Partial Index & Covering INCLUDE  │
│  - 5-Execution Rule Plan Cache       │  - BRIN Index (Append-Only)          │
│  - Named vs Unnamed Statements       │  - Foreign Key Indexing (Child table)│
├──────────────────────────────────────┼──────────────────────────────────────┤
│  Pilar 3: DECLARATIVE PARTITIONING   │  Pilar 4: STREAMING COPY PROTOCOL    │
│  - Range Partitioning Bulanan        │  - COPY FROM STDIN streaming         │
│  - Partition Pruning (Hemat 70% I/O) │  - 5-10x throughput ingest vs INSERT │
│  - Zero-Overhead Retention Dropping  │  - Sangat cocok untuk Worker Scraper │
├──────────────────────────────────────┴──────────────────────────────────────┤
│  Pilar 5: REPLICATION ARCHITECTURE (Scale-Out Guidance)                     │
│  - Tahap 1: Single Node Optimized (Kondisi saat ini, 100% Zero-Cost)        │
│  - Tahap 2: Read-Replica (Diadopsi jika data >5 juta baris / OLAP berat)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Pilar 1: Prepared Statements & Parameter Binding

#### 1.1 Array Binding `= ANY($1)` vs Dynamic `IN (...)`
- **Anti-Pattern:** Menyusun placeholder dinamis `IN ($1, $2, ...)` yang menghasilkan string SQL berbeda untuk setiap panjang array (memicu *plan cache bloat*).
- **Standar MTMS:** Gunakan array binding `= ANY($1)`:
  ```ts
  // BAIK: Bentuk teks query 100% konstan berapapun jumlah ID
  sql`warehouse_id = ANY(${warehouseIds}::int[])`
  ```

#### 1.2 Bulk Ingestion via `UNNEST($1, $2, ...)`
- **Anti-Pattern:** Merangkai string dinamis `VALUES ($1, $2), ($3, $4)...` yang memicu puluhan ribu parameter (seperti kasus 32.000 parameter di K-PRO).
- **Standar MTMS:** Gunakan `UNNEST` untuk bulk upsert dengan query statis:
  ```sql
  INSERT INTO public.data_kpro (wonum, crmordertype, status)
  SELECT * FROM UNNEST($1::varchar[], $2::varchar[], $3::varchar[])
  ON CONFLICT (wonum) DO UPDATE SET
    crmordertype = EXCLUDED.crmordertype,
    status = EXCLUDED.status;
  ```

#### 1.3 Siklus Plan Cache (The 5-Execution Rule)
- Pada eksekusi ke 1–5, PostgreSQL menggunakan **Custom Plan** (berdasarkan nilai parameter aktual).
- Pada eksekusi ke-6, PostgreSQL beralih ke **Generic Plan**.
- Jika kolom memiliki *data skew* ekstrem (misal 99% data status 'closed', 1% 'pending'), cegah pemilihan sequential scan yang salah dengan memaksakan custom plan:
  ```sql
  SET plan_cache_mode = force_custom_plan;
  ```

#### 1.4 Named vs Unnamed Statements di Node.js (`pg`)
- **Unnamed (Default):** Aman digunakan bersama PgBouncer mode transaction.
- **Named Statement:** Tambahkan opsi `name: '...'` hanya pada query dengan frekuensi panggilan sangat tinggi (misal: auth session lookup). Dilarang membuat nama dinamis (`name: 'query_' + Date.now()`).

---

### Pilar 2: Strategic Indexing

#### 2.1 Aturan Urutan Indeks Komposit
Letakkan kolom bertipe **kesetaraan (*equality*) terlebih dahulu**, baru kemudian kolom **rentang (*range*)**:
```sql
-- Mendukung: WHERE status = 'pending' AND created_at >= '2026-01-01'
CREATE INDEX idx_orders_status_date ON inventory.orders (status, created_at);
```

#### 2.2 Partial Index untuk Status Aktif
Indeks hanya baris yang sering dicari untuk menghemat ukuran disk dan RAM shared buffers:
```sql
CREATE INDEX idx_pending_returns ON inventory.return_material_header (warehouse_id)
WHERE end_status IN ('wait_approve', 'pending');
```

#### 2.3 Covering Index (`INCLUDE`)
Hilangkan *table heap lookup* dengan menyertakan kolom proyeksi pada indeks (menghasilkan *Index-Only Scan*):
```sql
CREATE INDEX idx_wh_lookup ON inventory.mas_wh (id) INCLUDE (name, branch);
```

#### 2.4 BRIN Index (Block Range Index) untuk Time-Series Append-Only
Untuk tabel log historis yang terus bertambah secara kronologis (`stock_movement`, `data_kpro`), gunakan **BRIN**. Ukuran indeks BRIN **95% lebih kecil** dari B-Tree standar:
```sql
CREATE INDEX idx_brin_stock_movement_created_at 
ON inventory.stock_movement USING brin (created_at);
```

#### 2.5 Foreign Key Indexing Wajib
Setiap kolom relasi anak (`header_id` di `wo_lensa_list`, `out_lensa_ref_list`, `inout_tag_items`) **wajib memiliki indeks** untuk mencegah *Sequential Scan* saat operasi `JOIN` atau `DELETE CASCADE`.

---

### Pilar 3: Declarative Range Partitioning

Untuk tabel transaksi bervolume besar (>500.000 baris):
1. Terapkan partisi bulanan berbasis tanggal (`PARTITION BY RANGE (created_at)`).
2. **Keuntungan (*Partition Pruning*):** Query yang mencari data bulan berjalan hanya memindai 1 partisi aktif, memangkas I/O disk hingga **70%–80%**.
3. **Pembersihan Data Instan:** Menghapus data kadaluarsa cukup dengan `DROP TABLE partition_2024_01` (instan dalam 1ms, tanpa overhead CPU dan bloat dari perintah `DELETE`).

---

### Pilar 4: Streaming Ingestion via `COPY`

Untuk worker scraper (Playwright/K-PRO/Lensa) yang memproses ribuan baris data:
- Gunakan protokol streaming `COPY FROM STDIN` (misal via library `pg-copy-streams`).
- `COPY` melewati *per-row SQL parsing* dan *transaction logging* berlebih, menghasilkan kecepatan ingestion **5x s.d. 10x lebih tinggi** dibanding operasi `INSERT ... VALUES`.

---

### Pilar 5: Replication Architecture (Scale-Out Policy)

- **Fase Saat Ini (Single-Node Optimized):**
  Volume data MTMS saat ini (~50 MB, puluhan ribu transaksi) **tidak memerlukan Read-Replica**. Seluruh kebutuhan transaksi dan dasbor dapat dilayani secara prima pada satu instance PostgreSQL.
- **Kapan Beralih ke Read-Replica?**
  Hanya jika volume data melampaui **5.000.000 baris** atau query laporan ekspor analitik berat mulai memicu *lock contention* terhadap transaksi submit teknisi/gudang.

---

## 3. High-Performance CTE Patterns (Common Table Expressions)

### 3.1 Single-Trip Pagination via `COUNT(*) OVER()`
**Aturan Wajib:** Jangan mengeksekusi CTE yang sama berulang kali (1x untuk count, 1x untuk data limit). Gabungkan menjadi 1 roundtrip jaringan:
```sql
-- STANDAR MTMS: 1 kali eksekusi CTE untuk data + total pagination
WITH combined AS (
    SELECT id, id_trx, created_at, 'inout' AS type FROM inventory.inout_tag_header
    UNION ALL
    SELECT id, id_trx, created_at, 'return' AS type FROM inventory.return_material_header
)
SELECT *, COUNT(*) OVER()::int AS total_count
FROM combined
WHERE created_at >= $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

### 3.2 Optimizer Control: `MATERIALIZED` vs `NOT MATERIALIZED`
- **Gunakan `MATERIALIZED`:** Jika hasil CTE adalah agregasi berat yang dipanggil lebih dari satu kali di query utama (mencegah rekalkulasi ulang).
- **Gunakan `NOT MATERIALIZED` (Default PG12+):** Membiarkan PostgreSQL mendorong filter predikat query luar masuk ke dalam subquery (*predicate pushdown*).

### 3.3 Mengubah Correlated Subquery di SELECT Menjadi CTE / LEFT JOIN
Hindari evaluasi subquery baris-per-baris (*row-by-row sub-scan*) di klausa SELECT:
```sql
-- STANDAR MTMS: Single Hash Join via CTE
WITH active_movements AS (
    SELECT DISTINCT warehouse_id, designator_id
    FROM inventory.stock_movement
    WHERE movement_type IN ('material_used', 'sap_out', 'transfer_out')
)
SELECT sb.*, (am.warehouse_id IS NOT NULL) AS has_out_history
FROM inventory.stock_balance sb
LEFT JOIN active_movements am
  ON am.warehouse_id = sb.warehouse_id
 AND am.designator_id = sb.designator_id;
```

### 3.4 Penelusuran Pohon dengan `WITH RECURSIVE`
Gunakan untuk hierarki bertingkat (WBS project SAP, hirarki wilayah multi-level):
```sql
WITH RECURSIVE tree AS (
    SELECT id, parent_id, title, title::text AS path
    FROM finance.sap_finance_tree
    WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, c.title, t.path || '/' || c.title
    FROM finance.sap_finance_tree c
    JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree;
```

---

## 4. Arsitektur Database-Centric ELT

Sesuai blueprint arsitektur ELT MTMS ([ADR-007](../../docs/adr/007-elt-staging-architecture-for-scrapers.md)), pipeline pengolahan data mentah eksternal (K-PRO, Out Lensa, WO Lensa) menerapkan alur kerja sekuensial (Opsi A: *Immediate Execution*):

> **Aturan Wajib:** Sebelum merancang atau mengubah pipeline data scraper, agen **wajib** membaca `docs/adr/007-elt-staging-architecture-for-scrapers.md` dan histori pembahasan arsitektur agar konsistensi desain tidak terputus.

1. **Task 1 (Extract):** Scraper worker (Playwright / Node.js) mengambil payload mentah tanpa parsing string rumit atau kalkulasi bisnis yang membebani V8 memory.
2. **Task 2 (Load):** Ingest payload mentah apa adanya ke tabel staging `jsonb` (`staging.stg_*_raw` / `etl.staging_*_raw`) dengan `batch_id UUID` dan metadata wilayah (`regional`, `branch_id`).
3. **Task 3 (Transform via Stored Procedure):** Eksekusi Stored Procedure di PostgreSQL (`sp_process_stg_*`) yang memanfaatkan:
   - Operasi berbasis himpunan (*set-based operation*) dan sanitasi regex.
   - Lookup normalisasi alias gudang via `inventory.warehouse_alias`.
   - Lookup normalisasi material via `inventory.material_alias`.
   - Pencatatan anomali alias baru yang belum terpetakan ke `inventory.unmapped_alias_log`.
   - *Dilarang keras hardcode string alias di TypeScript/Node.js.*
4. **Task 4 (Finalize, Safe MView Refresh & Centralized Audit):**
   - **Collision-Free Materialized View Refresh:** Jika pipeline menyegarkan Materialized View (misal `analytics.mv_kpro_rekon_summary`), gunakan `pg_try_advisory_xact_lock(hashtext('...'))` agar tidak melempar error saat `pg_cron` sedang me-refresh di waktu yang bersamaan.
   - **Automated Retention:** Log job (`etl.import_jobs`, `etl.upload_logs`) dan staging data dibersihkan otomatis dengan retensi 90 hari (60 hari garansi transaksi + 30 hari buffer). Data `FAILED` dipertahankan untuk audit investigasi.
   - Catat ringkasan metriks pemrosesan ke monitoring terpusat `inventory.scraper_cronjob_log`.

---

## 5. Checklist Kepatuhan Sebelum Rilis (Definition of Done)

Sebelum menyatakan tugas database selesai, pastikan:

- [ ] Konsistensi arsitektur dan ADR (`docs/adr/`) telah diverifikasi terhadap histori pembahasan.
- [ ] Pipeline scraper mengadopsi arsitektur ELT Database-Centric (Opsi A) dan Stored Procedure transform.
- [ ] Normalisasi alias (gudang/material) menggunakan tabel `inventory.*_alias`, bukan hardcoded di kode aplikasi.
- [ ] Refresh Materialized View terproteksi `pg_try_advisory_xact_lock` dari tabrakan jadwal `pg_cron`.
- [ ] Filter array menggunakan `= ANY($1)` alih-alih dynamic `IN (...)`.
- [ ] Bulk insert/upsert memanfaatkan `UNNEST` atau staging table, bukan string interpolasi dinamis.
- [ ] Query paginasi list dashboard yang menggunakan CTE menyatukan total count dan data via `COUNT(*) OVER()`.
- [ ] Tidak ada correlated subquery berulang di klausa `SELECT` (ganti dengan CTE + `LEFT JOIN`).
- [ ] Kolom filter berulang memiliki indeks komposit dengan urutan *equality first, range last*.
- [ ] Kolom Foreign Key pada tabel detail anak memiliki indeks.
- [ ] Tabel time-series append-only memanfaatkan indeks `BRIN`.
- [ ] Query dievaluasi dengan `EXPLAIN (ANALYZE, BUFFERS)` via MCP `postgres__query` dan tidak memicu Sequential Scan tak terduga pada tabel besar.
- [ ] Rujukan detail implementasi dan case-study kode nyata dapat dilihat di [`references/performance-playbook.md`](references/performance-playbook.md).
