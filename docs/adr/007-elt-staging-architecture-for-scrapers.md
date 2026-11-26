# ADR-007: Adopsi Arsitektur ELT (Staging Table & Database-Level Transformation) untuk Scraper Lensa dan K-PRO

- **Status**: Proposed (Coming Soon)
- **Tanggal**: 2026-11-25
- **Pengusul**: Planner / Data Architect & AI Agent
- **Komponen Terdampak**: 
  - Database Schemas: Skema baru `staging`, skema `inventory` (Stored Procedures & Master Alias)
  - Scraper Services: `src/lib/scrapers/` (Lensa Scraper, K-PRO Scraper)
  - Repositories: `src/lib/repositories/scraper.repository.ts`, `src/lib/repositories/staging.repository.ts`
  - Automated Jobs: `scripts/post-deploy/` (pg_cron cleaner)

---

## 1. Konteks (Context)

Saat ini, modul scraper MTMS (Lensa dan K-PRO) menggunakan Playwright / fetch berbasis Node.js dengan pola **ETL Konvensional (Transform in-memory)**:
1. **Extract**: Scraper mengunduh HTML/JSON dari portal eksternal (Lensa Telkom / K-PRO).
2. **Transform (Node.js)**: Parsing string, kalkulasi tanggal, dan pemetaan nama gudang/material dilakukan di memory aplikasi Node.js.
3. **Load**: Data hasil parsing langsung di-insert/upsert ke tabel produksi inti (`inventory.out_lensa_ref_header`, `inventory.out_lensa_ref_detail`, `inventory.wo_lensa_header`, `inventory.wo_lensa_detail`).

### Permasalahan yang Dihadapi & Kebutuhan Skalabilitas:
1. **Scraper Rentan Crash (Fragility)**: Jika portal upstream mengubah format angka, memuat karakter tak terduga, atau menambahkan kolom baru, skrip scraper mengalami runtime error di Node.js dan seluruh siklus scraping gagal di tengah jalan.
2. **Tipe Data Tabel Produksi Terlalu Longgar**: Demi mengakomodasi inkonsistensi data mentah dari portal sumber, tabel produksi terpaksa menggunakan tipe data generik (misalnya `VARCHAR(50)` untuk kuantitas `qty_approve` dan `VARCHAR(255)` untuk tanggal), yang menghambat optimasi query, integritas relasional, dan agregasi analitik.
3. **Kehilangan Raw Data & Audit Trail**: Payload asli dari portal eksternal tidak disimpan. Apabila terjadi selisih rekon atau klaim garansi material, tim tidak memiliki rekam jejak payload mentah untuk melakukan investigasi atau replay historis tanpa melakukan scrape ulang (yang seringkali mustahil karena data di portal upstream sudah berganti).
4. **Duplikasi Logika Bisnis & Hardcoding Alias**: Pemetaan variasi nama gudang (misal `"SO Karang Pilang"` vs `"SO Karangpilang"`) atau normalisasi nama material tersebar di kode JavaScript/TypeScript, melanggar prinsip `AGENTS.md` §1.2 (*"Business Rules di Database"*).
5. **Skalabilitas Hirarki Wilayah Multi-Level**:
   - Data K-PRO saat ini sudah mencakup **1 Regional (Jawa Timur)** meskipun saat ini tampilan dasbor difokuskan pada District Lamongan.
   - Transaksi Out Lensa dan WO Lensa ke depan **akan berkembang hingga level Regional**.
   - Arsitektur wajib mengakomodasi hirarki wilayah penuh Telkom:
     $$\text{Nasional} \longrightarrow \text{Area} \longrightarrow \text{Regional} \longrightarrow \text{Branch / District} \longrightarrow \text{Service Area} \longrightarrow \text{STO / Warehouse}$$
     Desain skema penampung dan lookup harus siap diskalakan ke seluruh Regional tanpa merombak struktur tabel.

---

## 2. Keputusan (Decision)

Mengalihkan arsitektur pipeline data scraper dari **ETL Aplikasi (Extract-Transform-Load)** menjadi **ELT Database-Centric (Extract-Load-Transform)** dengan **Trigger Otomatis Berurutan (Opsi A)**:

```
[ Lensa / K-PRO ]
       │
       ▼ (Task 1: Extract via Playwright)
[ Scraper Worker (Node.js) ]
       │
       ▼ (Task 2: Load as-is / Raw Dump JSONB)
[ Schema: staging ] ─── stg_out_lensa_raw / stg_wo_lensa_raw / stg_kpro_raw
       │
       ▼ (Task 3: Immediate Stored Procedure Trigger)
[ Schema: inventory ] ─── sp_process_stg_* (PL/pgSQL: Clean, Cast, Map Aliases)
       │
       ├─► Strict Production Tables (INTEGER, DATE, TIMESTAMPTZ)
       ├─► Unmapped Alias Log (inventory.unmapped_alias_log)
       │
       ▼ (Task 4: Finalize & Audit Log)
[ inventory.scraper_cronjob_log ]
```

### 2.1 Alur Pipeline Task Runtun & Rapi (Opsi A: Immediate Execution)
Setiap eksekusi scraping dijalankan dalam 4 task sekuensial yang terisolasi dan mudah diaudit:
- **Task 1: Extract (Playwright / Node.js Worker)**:
  - Mengunduh data mentah berupa HTML/JSON dari portal upstream (Lensa / K-PRO).
  - Tidak melakukan parsing atau validasi bisnis yang membebani memori V8.
- **Task 2: Load to Staging (Ingestion)**:
  - Mengirimkan raw payload secara utuh ke skema `staging` dalam satu batch transaction (`batch_id UUID`).
  - Menyertakan metadata hirarki wilayah (`regional`, `branch_id`, `service_area`, `sto_code`).
  - Status batch awal dicatat sebagai `'PENDING'`.
- **Task 3: Transform & Upsert via Stored Procedure (PostgreSQL Engine)**:
  - Begitu Task 2 berhasil, worker langsung memanggil Stored Procedure:
    `CALL inventory.sp_process_stg_*(p_batch_id, v_processed, v_error);`
  - PostgreSQL melakukan parsing berbasis set (*set-based operation*), sanitasi regex, konversi tanggal ISO/WIB, lookup alias gudang & material via master table, dan atomic upsert ke tabel produksi inti.
  - Anomali alias baru otomatis dialirkan ke `inventory.unmapped_alias_log`.
  - Status record staging diperbarui menjadi `'PROCESSED'` atau `'FAILED'`.
- **Task 4: Finalize & Logging**:
  - Scraper worker mencatat rekap hasil (`processed_count`, `error_count`, durasi) ke `inventory.scraper_cronjob_log`.
  - Jika terdapat alias baru yang belum terpetakan, sistem memicu notifikasi peringatan (*warning alert*).

### 2.2 Pembentukan Skema `staging` Mendukung Hirarki Wilayah
Skema `staging` terisolasi dari tabel operasional transaksi dan dilengkapi metadata regional:

```sql
CREATE SCHEMA IF NOT EXISTS staging;

-- Tabel Penyangga Mentah: Out Lensa Ref
CREATE TABLE staging.stg_out_lensa_raw (
    id BIGSERIAL PRIMARY KEY,
    batch_id UUID NOT NULL,
    source_system VARCHAR(50) NOT NULL DEFAULT 'LENSA_OUT',
    -- Metadata Hirarki Wilayah Telkom
    regional VARCHAR(50) NOT NULL DEFAULT 'REGIONAL-5',     -- Regional V (Jatim)
    branch_id VARCHAR(50),                                  -- District / Witel (Lamongan, Gresik, dll)
    service_area VARCHAR(50),                               -- Service Area
    sto_code VARCHAR(50),                                   -- STO / Warehouse Unit
    raw_payload JSONB NOT NULL,
    record_count INT DEFAULT 0,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',          -- 'PENDING', 'PROCESSED', 'FAILED', 'PARTIAL'
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stg_out_lensa_status_batch ON staging.stg_out_lensa_raw (status, batch_id);
CREATE INDEX idx_stg_out_lensa_hierarchy ON staging.stg_out_lensa_raw (regional, branch_id);
```

### 2.3 Tabel Normalisasi & Pemetaan Alias (Master Lookup Multi-Level)
Seluruh normalisasi teks dan alias dikelola di level basis data:
- `inventory.warehouse_alias`: Memetakan string nama gudang dari Lensa/K-PRO ke `warehouse_id` master (`inventory.mas_wh`), dilengkapi kolom `regional` dan `branch_id`.
- `inventory.material_alias`: Memetakan nama material tidak baku atau variasi penamaan ke `intech_code` master.
- `inventory.unmapped_alias_log`: Mencatat alias baru yang belum terdaftar di tabel master agar dapat ditinjau admin tanpa menghentikan pipeline.

### 2.4 Kebijakan Retensi Data Staging (90 Hari: 60 Hari Garansi + 30 Hari Buffer)
Tabel staging berfungsi sebagai penyangga sementara (*buffer*) dan *replay audit trail* untuk klaim garansi:
- **Durasi Retensi**: Data `PROCESSED` dipertahankan selama **90 hari** (60 hari masa garansi transaksi/pekerjaan + 30 hari masa tenggang/penyangga rekonsiliasi).
- **Evaluasi Berkala**: Kebijakan retensi ini akan dievaluasi secara berkala seiring ekspansi data Out/WO Lensa ke skala penuh 1 Regional Jawa Timur.
- **Pembersihan Otomatis**: Dijalankan via `pg_cron` mingguan menggunakan prosedur:
  `staging.sp_cleanup_stg_data(p_retention_days INT DEFAULT 90);`
- Data berstatus `'FAILED'` **tidak dihapus otomatis** agar tetap tersedia untuk investigasi tim teknis.

---

## 3. Konsekuensi (Consequences)

### Positif
- **Ketahanan Tinggi (Resilient Scraper)**: Scraper hanya bertugas *fetch & dump* JSON mentah. Tidak ada lagi scraper yang mogok karena parsing gagal atau perubahan minor layout.
- **Auditabilitas Penuh & Kemampuan Replay**: Jika ditemukan anomali atau penyesuaian aturan bisnis di kemudian hari, data mentah di `staging` dapat diproses ulang (*re-run/re-parse*) tanpa perlu scrape ulang portal eksternal.
- **Kualitas & Integritas Data Maksimal**: Tabel produksi dijamin hanya berisi data yang sudah tervalidasi dan bertipe data kuat (`INTEGER`, `DATE`, `TIMESTAMPTZ`), mengeliminasi bug runtime di dashboard dan query agregasi.
- **Performa Tinggi**: Transformasi berbasis set (*set-based operation*) di dalam PostgreSQL memanfaatkan engine query C native yang jauh lebih cepat daripada pemrosesan baris demi baris di Node.js.
- **Sesuai Pedoman Arsitektur**: Selaras penuh dengan `AGENTS.md` §1.2 (*Business Rules di Database*).

### Kompromi / Trade-off
- **Peningkatan Penggunaan Storage**: Menyimpan payload JSON mentah membutuhkan ruang disk tambahan (dimitigasi dengan indeks parsial dan kebijakan retensi otomatis 30–60 hari).
- **Dual-Layer Logic Maintenance**: Logika transformasi ditulis dalam PL/pgSQL, sehingga developer perlu menguasai sintaks SQL/JSONB PostgreSQL di samping TypeScript.

---

## 4. Alternatif yang Dipertimbangkan

- **Alternatif A: Mempertahankan In-Memory ETL di Node.js (Status Quo)**
  - *Alasan ditolak*: Scraper sering crash saat terjadi inkonsistensi data mentah; tabel produksi terpaksa mempertahankan tipe data longgar (`VARCHAR`); payload mentah hilang sehingga mustahil merekonstruksi riwayat parsing.
- **Alternatif B: Migrasi Scraper & Pipeline ke Python (Pandas/Airflow/Celery)**
  - *Alasan ditolak*: Menambah dependensi bahasa dan runtime baru pada infrastruktur server MTMS yang sudah stabil di ekosistem Next.js/Node.js + PostgreSQL. PostgreSQL sudah memiliki kapabilitas manipulasi JSONB dan stored procedure yang sangat memadai tanpa perlu overhead sistem baru.

---

## 5. Rencana Pelaksanaan Bertahap (Roadmap)

Pelaksanaan arsitektur ELT dirancang dalam 4 tahap tanpa *downtime*:

| Fase | Target Pekerjaan | Output / Artefak |
|---|---|---|
| **Fase 1** | Pembuatan skema `staging`, tabel raw JSONB, dan tabel master alias | Migrasi SQL: `staging` schema, `warehouse_alias`, `material_alias` |
| **Fase 2** | Pembuatan Stored Procedure transformasi & sanitasi data | Stored Procedure: `sp_process_stg_out_lensa`, `sp_process_stg_wo_lensa`, `sp_process_stg_kpro` |
| **Fase 3** | Penyesuaian skrip Scraper Playwright agar memuat data mentah ke staging | `src/lib/scrapers/`, `src/lib/repositories/staging.repository.ts` |
| **Fase 4** | Migrasi data historis, aktivasi pengetatan tipe data di tabel produksi, dan setup cron retensi | Migrasi tipe data produksi (`ALTER TABLE ... ALTER COLUMN ... TYPE`) & cron retention script |
