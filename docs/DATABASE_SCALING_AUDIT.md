# Audit & Analisis Database Scaling: 8 Pilar Skalabilitas MTMS

> **Dokumen Referensi Skalabilitas Database Monitoring Transaction Material's System (MTMS)**  
> **Tanggal Audit:** 11 November 2026  
> **Target Analisis:** 8 Pilar Database Scaling (N+1, Connection Pooling, Read Replicas, Caching, Batch Writes, Archiving, Denormalization, Observability).

---

## Ringkasan Eksekutif & Matriks Kesiapan

Berdasarkan audit langsung pada arsitektur kode (`Kysely`, `pg.Pool`, `ioredis`, `lru-cache`), stored procedures, skema PostgreSQL (`inventory`, `hr`, `auth`), serta data statistik ukuran relasi aktual:

| No | Pilar Scaling | Status di MTMS | Skor Kesiapan | Prioritas Tindakan |
|---|---|---|:---:|:---:|
| 1 | **Fix N+1 Query** | Sudah Diimplementasikan Sebagian Besar | **85%** | P2 (Optimasi Redis Presence) |
| 2 | **Connection Pooling** | Sudah Diimplementasikan Lengkap | **100%** | P3 (Monitor & Sizing) |
| 3 | **Read Replicas** | Belum Diimplementasikan | **50%** | P3 (Belum Mendesak) |
| 4 | **Cache Hot Reads** | Sudah Diimplementasikan Sangat Baik | **90%** | P2 (Cache Dashboard Top Cards) |
| 5 | **Batch Writes** | Sudah Diimplementasikan Baik | **85%** | P2 (Pertahankan Chunking 200) |
| 6 | **Archive Old Data** | Belum Diimplementasikan | **30%** | **P1 (Sangat Direkomendasikan)** |
| 7 | **Denormalize Carefully** | Sudah Diimplementasikan Sangat Baik | **95%** | P3 (Pertahankan Invarian SP) |
| 8 | **Measure First** | Sebagian Diimplementasikan | **50%** | **P1 (Aktifkan `pg_stat_statements` & Missing FK Index)** |

---

## 1. Fix N+1 Query *(One query, not a hundred)*

### Status: **85% — SUDAH DIIMPLEMENTASIKAN**
MTMS telah mengeliminasi sebagian besar anti-pattern N+1 query melalui batch fetching dan stored procedures.

### Bukti Audit di Kode:
1. **Batch Fetching Child Items**:
   - Pada `src/app/(DashboardLayout)/reference/wo-lensa-ref/_actions/wo-lensa-queries.ts` (L294) dan `out-lensa-queries.ts` (L190):
     ```typescript
     // Batch fetch details untuk seluruh headers dalam 1 query:
     const details = await db
         .selectFrom('inventory.wo_lensa_list')
         .selectAll()
         .where('header_id', 'in', headerIds)
         .execute();
     ```
     Sistem tidak melakukan query berulang di dalam perulangan `headers.map(...)`.
2. **Push Logic to DB (Stored Procedure)**:
   - Transaksi rekon (`sp_record_rekon_lensa_v2`, `sp_submit_rekon_intech`) menerima array material dalam satu payload JSONB. Operasi header, list, audit log, dan pengurangan stok dieksekusi secara atomik di dalam PostgreSQL dalam 1 roundtrip jaringan.

### Celah & Rekomendasi (Gap):
- **Redis Presence N+1**: Di `src/app/(DashboardLayout)/management/users/actions.ts` (L97), pengecekan status online pengguna masih memanggil `isUserOnline(nik)` per baris via `Promise.all` ($N$ panggilan Redis `SCAN/GET`).
  - *Solusi:* Ubah menjadi pipelining atau `redis.mget` untuk mengambil seluruh indeks kehadiran dalam 1 roundtrip.
- **Missing Foreign Key Index**: Query `WHERE header_id IN (...)` di `wo_lensa_list` dan `out_lensa_ref_list` saat ini masih melakukan *Sequential Scan* karena belum ada indeks pada kolom `header_id` (lihat Pilar 8).

---

## 2. Connection Pooling *(Reuse, don't reconnect)*

### Status: **100% — SUDAH DIIMPLEMENTASIKAN LENGKAP**
Koneksi database dikelola secara terpusat melalui connection pool dengan lifecycle yang aman.

### Bukti Audit di Kode (`src/lib/db/db.ts`):
1. **Pool Configuration**:
   ```typescript
   const poolConfig: PoolConfig = {
       connectionString: process.env.DATABASE_URL,
       max: Number(process.env.DATABASE_POOL_MAX) || 10,
       idleTimeoutMillis: 30000,       // Tutup koneksi nganggur setelah 30 detik
       connectionTimeoutMillis: 5000,  // Fail fast jika DB antri lebih dari 5 detik
   };
   ```
2. **Error Safeguard**:
   - `pool.on('error', (err) => { dbLogger.error('Unexpected error on idle PostgreSQL client in pool', err); })` aktif untuk mencegah process crash akibat koneksi TCP terputus di latar belakang.
3. **Singleton Pattern (Anti-Leak saat HMR)**:
   - Menggunakan `globalThis.__mtms_pg_pool` dan `globalThis.__mtms_kysely_db` sehingga hot-reloading Next.js di development tidak melipatgandakan pool koneksi.

### Rekomendasi Skala Lanjut:
- Untuk deployment multi-instance / serverless / container cluster di masa depan, gunakan **PgBouncer** (Transaction Mode) di depan PostgreSQL agar total koneksi aplikasi tidak melampaui `max_connections` database.

---

## 3. Read Replicas *(Spread the reads)*

### Status: **50% — BELUM DIIMPLEMENTASIKAN & BELUM MENDESAK**

### Analisis Kebutuhan:
- Saat ini MTMS menggunakan instance tunggal `DATABASE_URL` untuk operasi baca dan tulis.
- Volume database saat ini (~50 MB, puluhan ribu transaksi) masih sangat ringan untuk ditangani oleh instance PostgreSQL tunggal bertipe standard (2–4 vCPU, 4–8 GB RAM).
- *Bottleneck* utama saat ini bukan pada kapasitas I/O baca PostgreSQL, melainkan pada durasi scraping eksternal dan rendering UI.

### Kapan Read Replica Dibutuhkan?
1. Ketika laporan analitik berat (misal export ratusan ribu baris di `rekon-export-actions.ts` atau dashboard kalkulasi historis 1 tahun) mulai memicu lonjakan CPU yang mengganggu transaksi operasional kasir/gudang.
2. Saat konkurensi pengguna operasional mencapai ratusan pengguna aktif simultan.

### Rencana Arsitektur Kysely Multi-Dialect (Roadmap):
Kysely dirancang modular untuk read-replica:
```typescript
// Blueprint masa depan:
export const dbRead = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: readReplicaPool }),
});
export const dbWrite = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: primaryPool }),
});
```

---

## 4. Cache Hot Reads *(Skip the database)*

### Status: **90% — SUDAH DIIMPLEMENTASIKAN SANGAT BAIK**
MTMS menerapkan arsitektur caching berjenjang (2-Tier Cache: L1 In-Memory + L2 Distributed Redis).

### Bukti Audit di Kode:
1. **L1 In-Memory Bounded LRU Cache (`src/lib/cache/lru-cache.ts`)**:
   - `masterDataLru` (TTL 5m): Data referensi teknisi, gudang, mitra.
   - `sessionMetaLru` (TTL 30s): Data izin akses & warehouse scoping per session NIK (meniadakan query DB/Redis saat navigasi antar menu).
   - `liveStockLru` (TTL 30s): Snapshot multi-tabel saldo stok publik untuk menahan spike traffic.
   - `notificationLru` (TTL 20s): Counter lonceng notifikasi pending approval.
2. **L2 Distributed Redis Cache (`src/lib/redis.ts`)**:
   - `dashboard:performance:v2:...` (TTL 60 detik) untuk metrik leaderboard dan performa 30 hari.
   - Secondary storage session authentication pada Better Auth (`auth.ts`).
   - Distributed Locks (`SET NX EX`) pada background worker untuk mencegah race condition / thundering herd.

### Area Optimasi (Gap):
- Kartu KPI ringkasan atas dashboard (Total Out Lensa Hari Ini, Total Rekon Hari Ini) dapat dibungkus cache Redis bertarget TTL 30–60 detik dengan auto-invalidation saat transaksi baru disimpan.

---

## 5. Batch Writes *(Fewer, bigger writes)*

### Status: **85% — SUDAH DIIMPLEMENTASIKAN**

### Bukti Audit di Kode:
1. **Chunked Multi-Row Updates (`sync-service.ts` & `nightly-service.ts`)**:
   - Pembaruan nomor GI menggunakan pemecahan chunk per 200 baris dengan sintaks PostgreSQL `UPDATE ... FROM (VALUES ...) AS updates` via `sql.join`:
     ```typescript
     for (let index = 0; index < rowsWithGi.length; index += 200) {
         const batch = rowsWithGi.slice(index, index + 200);
         // 1 query update 200 baris sekaligus
     }
     ```
2. **Bulk Upsert**:
   - Penyimpanan ribuan header WO menggunakan `ON CONFLICT (pemakaian_id) DO UPDATE`.
3. **Internal PL/pgSQL Bulk Insert**:
   - Penyimpanan baris material rekon langsung diproses di dalam stored procedure menggunakan `jsonb_to_recordset` / batch loops di engine DB.

### Area Optimasi:
- Pertahankan batas batching antara 200 s/d 500 baris untuk menjaga batas parameter query PostgreSQL ($65.535$ bind parameters) dan mencegah *lock escalation*.

---

## 6. Archive Old Data *(Smaller hot table)*

### Status: **30% — BELUM DIIMPLEMENTASIKAN (REKOMENDASI PRIORITAS P1)**

### Temuan Kondisi Data Saat Ini:
Tabel-tabel transaksi bertambah secara monoton setiap hari:
- `inventory.stock_movement`: **21.817 baris (5,1 MB)**
- `inventory.out_lensa_ref_list`: **1.589 baris (6,8 MB)**
- `inventory.out_lensa_ref_header`: **9.710 baris (5,4 MB)**
- `inventory.rekon_used_list`: **12.563 baris (1,8 MB)**
- `inventory.wo_lensa_list`: **12.287 baris (1,6 MB)**
- `inventory.wo_lensa_header`: **3.535 baris (1,6 MB)**

Meskipun sistem sudah memiliki filter bisnis `CUTOFF_MONTH` (misal mengabaikan data sebelum Oktober saat scraping), **data historis lama tetap menumpuk di tabel operasional aktif**.

### Dampak Tanpa Arsip:
Dalam 1–2 tahun:
- Tabel `stock_movement` dan `wo_lensa_*` akan mencapai $500.000+$ baris.
- Buffer pool RAM database akan terisi oleh baris lama yang sudah tidak pernah dilihat di dashboard harian.
- Waktu vacuum, re-index, dan backup harian meningkat signifikan.

### Rekomendasi Solusi & Roadmap Partisi:
1. **PostgreSQL Table Partitioning**:
   - Ubah `inventory.stock_movement` menjadi tabel terpartisi berdasarkan rentang waktu:
     ```sql
     CREATE TABLE inventory.stock_movement (...) PARTITION BY RANGE (created_at);
     ```
     Partisi per bulan (misal `stock_movement_2026_10`, `stock_movement_2026_11`).
2. **Tabel Arsip Historis (Cold Storage)**:
   - Buat tabel `inventory.wo_lensa_header_archive` dan `inventory.wo_lensa_list_archive`.
   - Jadwalkan pg_cron bulanan untuk memindahkan data WO yang sudah berstatus `rekon_check = TRUE` dan berusia di atas 6 bulan ke tabel arsip.

---

## 7. Denormalize Carefully *(Fewer joins, more care)*

### Status: **95% — SUDAH DIIMPLEMENTASIKAN DENGAN SANGAT BAIK**
MTMS menerapkan denormalisasi terukur pada titik-titik krusial performa dengan perlindungan konsistensi data tingkat database.

### Bukti Audit di Kode:
1. **Denormalisasi `formatted_date` (Tipe `DATE`)**:
   - Disimpan redundan di `wo_lensa_header` dan `out_lensa_ref_header` mendampingi string format asli Lensa `tanggal_update` (`dd/MM/yyyy HH:mm:ss`).
   - *Manfaat:* Meniadakan konversi string `TO_DATE(...)` pada query pencarian/dashboard, memungkinkan B-Tree index scan langsung dengan kecepatan tinggi.
2. **Denormalisasi Flag `rekon_check` (Tipe `BOOLEAN`)**:
   - Disimpan langsung pada `inventory.wo_lensa_header`.
   - *Manfaat:* Menghilangkan kebutuhan `LEFT JOIN inventory.rekon_used_header` atau klausa subquery `EXISTS (...)` pada setiap render tabel referensi WO Lensa.
3. **Denormalisasi Flag `sap_out_check` (Tipe `BOOLEAN`)**:
   - Disimpan pada `inventory.out_lensa_ref_header` untuk mencocokkan reservasi Out SAP secara instan.
4. **Integritas Dijamin Stored Procedure**:
   - Konsistensi flag denormalisasi (`rekon_check`) diperbarui secara otomatis dan atomik di dalam stored procedure (`sp_record_rekon_lensa_v2` dan `sp_rollback_rekon_lensa_by_pemakaian`), mencegah data desinkronisasi.

---

## 8. Measure First *(Find the slow query)*

### Status: **50% — SEBAGIAN DIIMPLEMENTASIKAN (REKOMENDASI PRIORITAS P1)**

### Temuan Audit:
1. **Sudah Ada:**
   - Setting logging audit pada `src/lib/db/migrations/018_enable_query_logging.sql` (`log_min_duration_statement = 1000` ms untuk mencatat query yang memakan waktu di atas 1 detik).
   - Structured logger `dbLogger` via Pino di aplikasi.
2. **Temuan Kritis (GAP):**
   - **`pg_stat_statements` belum terpasang** (Extension terpasang saat ini hanya `plpgsql` dan `pg_cron`).
   - Tanpa `pg_stat_statements`, DBA/developer tidak dapat melakukan analisis kuantitatif agregat (misal: query mana yang memakan 60% total waktu database, mean latency, dan buffer cache hit ratio).
   - **Missing Foreign Key Index pada Tabel Child**:
     Hasil query `pg_indexes` membuktikan bahwa:
     - `inventory.wo_lensa_list` **TIDAK memiliki indeks pada kolom `header_id`**.
     - `inventory.out_lensa_ref_list` **TIDAK memiliki indeks pada kolom `header_id`**.
     - `inventory.sap_out_items` **TIDAK memiliki indeks pada kolom `header_id`**.
     Hal ini menyebabkan query `WHERE header_id IN (...)` dan cascading delete melakukan **Sequential Scan penuh** pada tabel detail.

---

## Roadmap Rekomendasi Tindakan (Action Plan)

### Prioritas P1 (Segera Dilakukan):
1. **Tambahkan Indeks Foreign Key pada Tabel Detail**:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_wo_lensa_list_header_id ON inventory.wo_lensa_list (header_id);
   CREATE INDEX IF NOT EXISTS idx_out_lensa_ref_list_header_id ON inventory.out_lensa_ref_list (header_id);
   CREATE INDEX IF NOT EXISTS idx_sap_out_items_header_id ON inventory.sap_out_items (header_id);
   ```
2. **Aktifkan Extension `pg_stat_statements`**:
   - Tambahkan `shared_preload_libraries = 'pg_stat_statements'` pada `postgresql.conf`.
   - Jalankan `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`.
3. **Rancang Partisi / Arsip Data Tua**:
   - Siapkan strategi partisi atau tabel arsip bulanan untuk `inventory.stock_movement` dan `wo_lensa_*` data > 6 bulan.

### Prioritas P2 (Penyempurnaan Menengah):
4. **Optimasi Redis Presence N+1**:
   - Ganti loop `isUserOnline` per NIK di `management/users/actions.ts` dengan batch `redis.mget`.
5. **Tambahkan Cache Layer untuk Dashboard Summary**:
   - Cache metrik agregasi kartu KPI dashboard dengan TTL 60 detik.

### Prioritas P3 (Jangka Panjang saat Traffic Naik):
6. **Pisahkan Read Replica**:
   - Siapkan pooling `dbRead` dan `dbWrite` saat utilisasi CPU instance database mencapai konsisten > 70%.

