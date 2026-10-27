# Panduan Implementasi & Deployment ke Server Produksi
## Monitoring Transaction Material's System (MTMS)

Dokumen ini merupakan panduan operasional standar (SOP) untuk menerapkan rilis terbaru MTMS ke server produksi. Panduan ini mencakup persiapan infrastruktur, migrasi database, isolasi background worker, build aplikasi, dan verifikasi pasca-deploy.

---

## 1. Ikhtisar Arsitektur Rilis Terbaru

Rilis ini membawa 3 pilar peningkatan utama:
1. **Performa (Isolasi Scraper):** Arsitektur runtime kini terpisah menjadi 2 proses mandiri yang dikelola oleh PM2 via `ecosystem.config.js`:
   - `mtms-web`: Web server Next.js (cluster mode) yang melayani traffic HTTP/UI pengguna tanpa terbebani memory leak browser.
   - `mtms-worker`: Dedicated worker (fork mode) yang mengeksekusi browser automation Playwright untuk scraping Lensa secara terisolasi.
2. **Kredibilitas (Integritas Data & Auditability):**
   - **Migrasi 040:** Penegakan integritas data return material, validasi kuantitas di stored procedure (`sp_create_return_request` / `sp_insert_return_item`) untuk mencegah over-return secara kumulatif, dan foreign key constraints.
   - **Migrasi 041:** Pengaktifan Row-Level Security (RLS) pada tabel `inventory.stock_opname_log` dan pencabutan hak akses publik guna mematuhi prinsip *least privilege*.
3. **Kualitas & Ketahanan (Resilience & Automated Testing):**
   - Standardisasi repository Kysely (`generateTrxUsedSeq`, `generateTrxUsedLensaSeq`, `markWoLensaReconciled`) menggantikan query ad-hoc.
   - Seluruh server action mengembalikan format standar `{ success, data?, error? }` dengan server-side logging terstruktur (`actionLogger`/`securityLogger`).
   - Regresi otomatis tervalidasi via Vitest (390 unit tests + 34 integration tests).

---

## 2. Prasyarat Server Produksi (Prerequisites)

Sebelum memulai deployment, pastikan server produksi memenuhi spesifikasi berikut:

### 2.1 Kebutuhan Sistem & Runtime
- **Operating System:** Linux (Ubuntu 20.04/22.04/24.04 LTS atau Debian 11/12 direkomendasikan).
- **Node.js:** Versi `v20.x LTS` (atau minimal `v18.18+`).
  ```bash
  node -v # Pastikan >= 20.x
  npm -v  # Pastikan >= 10.x
  ```
- **Process Manager:** PM2 global terinstal.
  ```bash
  npm install -g pm2
  ```
- **PostgreSQL:** Versi 15+ dengan database `mtms` aktif dan ekstensi `uuid-ossp` aktif.
- **Redis Server:** Versi 6.x atau 7.x berjalan pada port default `6379` untuk session store, rate limiter, dan antrian background scraper.
- **Playwright OS Dependencies:** Pustaka sistem Linux yang dibutuhkan oleh Chromium:
  ```bash
  # Pada server Linux berbasis Debian/Ubuntu:
  sudo npx playwright install-deps chromium
  ```

---

## 3. Konfigurasi Environment Variables (`.env`)

Pastikan file `.env` di root direktori project server produksi telah terkonfigurasi dengan benar:

```ini
# ===================================================
# 1. APPLICATION & NETWORK
# ===================================================
NODE_ENV=production
PORT=8000
NEXT_PUBLIC_APP_URL=https://mtms.domain-anda.co.id

# ===================================================
# 2. DATABASE (PostgreSQL)
# ===================================================
DATABASE_URL=postgresql://mtms_user:StrongPasswordHere@127.0.0.1:5432/mtms?sslmode=prefer

# ===================================================
# 3. CACHE & QUEUE (Redis)
# ===================================================
REDIS_URL=redis://127.0.0.1:6379

# ===================================================
# 4. AUTHENTICATION & SECURITY (Better Auth)
# ===================================================
BETTER_AUTH_SECRET=generate_random_secret_minimal_32_karakter
BETTER_AUTH_URL=https://mtms.domain-anda.co.id
MFA_ENCRYPTION_SECRET=generate_random_secret_32_karakter_untuk_aes_gcm

# ===================================================
# 5. INTEGRASI LENSA SCRAPER
# ===================================================
LENSA_URL=https://lensa-inventory.telkomakses.co.id
LENSA_USERNAME=akun_service_lensa
LENSA_PASSWORD=password_service_lensa

# ===================================================
# 6. PM2 PROCESS & WORKER FLAGS
# ===================================================
RUN_EMBEDDED_CRON=false
WORKER_ROLE=scraper-cron
```

> [!IMPORTANT]
> Pastikan `RUN_EMBEDDED_CRON=false` pada environment produksi agar Next.js web server tidak menjalankan browser scraper di dalam proses web, melainkan mendelegasikannya ke proses `mtms-worker`.

---

## 4. Langkah-Langkah Deployment (Step-by-Step)

Jalankan tahapan berikut secara berurutan di server produksi:

### Langkah 1: Backup Database Produksi (Snapshot Aman)
Sebelum melakukan migrasi skema, buat backup snapshot database terkini:
```bash
# Ganti nama file sesuai tanggal dan jam deployment
pg_dump -U mtms_user -h 127.0.0.1 -d mtms -F c -b -v -f /var/backups/mtms/backup_pre_deploy_$(date +%Y%m%d_%H%M%S).dump
```

### Langkah 2: Tarik Source Code Terbaru dari Git
Masuk ke direktori aplikasi dan pull branch `main`:
```bash
cd /var/www/mtms  # Sesuaikan dengan direktori aplikasi Anda
git fetch origin main
git checkout main
git pull origin main
```

### Langkah 3: Instalasi Dependencies & Binary Browser
Gunakan `npm ci` untuk memastikan dependensi sesuai dengan `package-lock.json`:
```bash
npm ci

# Pastikan binary browser Chromium Playwright terpasang
npx playwright install chromium
```

### Langkah 4: Jalankan Migrasi Database
Terapkan migrasi skema terbaru (termasuk migrasi 040 & 041):
```bash
npm run migrate
```
*Output yang diharapkan:*
```
Applying migration: 040_fix_return_material_integrity.sql ... OK
Applying migration: 041_enable_rls_stock_opname_log_and_revoke_public.sql ... OK
All migrations applied successfully.
```

### Langkah 5: Jalankan Pengujian Otomatis (Opsional / Sanity Check)
Jalankan unit dan integration tests untuk memastikan koneksi database dan skema valid:
```bash
npm run test:unit
npm run test:integration
```
*Pastikan seluruh tes passed (390 unit + 34 integration).*

### Langkah 6: Build Aplikasi Web Next.js
Kompilasi aplikasi web untuk produksi:
```bash
npm run build
```
*Pastikan proses build berhasil tanpa error TypeScript atau lint.*

### Langkah 7: Jalankan / Reload PM2 Ecosystem
Jalankan kedua proses (`mtms-web` dan `mtms-worker`) menggunakan konfigurasi PM2:
```bash
# Jika ini deployment pertama kali:
pm2 start ecosystem.config.js --env production

# Jika aplikasi sudah berjalan sebelumnya (Zero-Downtime Reload):
pm2 reload ecosystem.config.js --env production
```

Simpan konfigurasi PM2 agar otomatis berjalan saat server reboot:
```bash
pm2 save
```

---

## 5. Verifikasi Pasca-Deployment (Smoke Testing)

Setelah proses deployment selesai, lakukan verifikasi cepat berikut:

### 5.1 Cek Status PM2 Process
Jalankan:
```bash
pm2 status
```
*Pastikan kedua proses berstatus `online`:*
```
┌────┬──────────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┐
│ id │ name                 │ mode        │ status  │ restart │ uptime   │ cpu    │ mem  │ user      │
├────┼──────────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┤
│ 0  │ mtms-web             │ cluster     │ online  │ 0       │ 1m       │ 0%     │ 120M │ www-data  │
│ 1  │ mtms-worker          │ fork        │ online  │ 0       │ 1m       │ 0%     │ 85M  │ www-data  │
└────┴──────────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┘
```

### 5.2 Monitor Log Realtime
Periksa log untuk memastikan tidak ada unhandled error:
```bash
# Log Web Server
pm2 logs mtms-web --lines 50

# Log Background Scraper Worker
pm2 logs mtms-worker --lines 50
```

### 5.3 Smoke Test Fungsional Aplikasi
1. **Akses Web UI:** Buka `https://mtms.domain-anda.co.id` di browser, pastikan halaman login terbuka lancar dan login pengguna berhasil.
2. **Uji Transaksi Material:**
   - Masuk ke menu **Form > Return Material**: Lakukan pembuatan transaksi return untuk memastikan validasi SP 040 berjalan.
   - Masuk ke menu **Form > Rekon Intech & Rekon Lensa**: Lakukan submission untuk memastikan sequence `trx_used_seq` dan `trx_used_lensa_seq` terbentuk otomatis.
3. **Uji Isolasi Worker Scraper:**
   - Masuk ke menu **Reference > WO Lensa Ref** atau **Stock Comparison**.
   - Jalankan aksi scrape/sync.
   - Amati respon web tetap cepat tanpa lag, sementara eksekusi Playwright berjalan di background worker (`pm2 logs mtms-worker`).

---

## 6. Prosedur Rollback (Disaster Recovery)

Jika terjadi kendala kritis pada rilis produksi, lakukan prosedur pemulihan berikut:

### Rollback Cepat Aplikasi & Worker
```bash
# 1. Kembalikan ke commit/tag stabil sebelumnya
git log -n 5 --oneline
git checkout <COMMIT_HASH_SEBELUMNYA>

# 2. Build ulang
npm ci
npm run build

# 3. Reload PM2
pm2 reload ecosystem.config.js --env production
```

### Rollback Database (Jika Diperlukan)
Jika migrasi 040 atau 041 perlu dibatalkan secara spesifik:
```bash
# Masuk ke psql:
psql -U mtms_user -d mtms

-- Rollback 041:
ALTER TABLE inventory.stock_opname_log DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_opname_log_select_policy ON inventory.stock_opname_log;
DROP POLICY IF EXISTS stock_opname_log_insert_policy ON inventory.stock_opname_log;
DELETE FROM inventory._migration_log WHERE filename = '041_enable_rls_stock_opname_log_and_revoke_public.sql';

-- Rollback 040:
-- (Hapus foreign key constraint jika menghalangi operasi lama)
ALTER TABLE inventory.trx_return_item DROP CONSTRAINT IF EXISTS fk_trx_return_item_material_sap;
DELETE FROM inventory._migration_log WHERE filename = '040_fix_return_material_integrity.sql';
```

Atau restore snapshot database penuh:
```bash
pg_restore -U mtms_user -h 127.0.0.1 -d mtms -c -v /var/backups/mtms/backup_pre_deploy_<TIMESTAMP>.dump
```

---

## 7. Troubleshooting Umum

| Gejala Masalah | Kemungkinan Penyebab | Tindakan Penyelesaian |
|---|---|---|
| `mtms-worker` restart berulang kali (error: missing shared library) | Library sistem Linux untuk headless Chromium belum lengkap | Jalankan `sudo npx playwright install-deps chromium` lalu restart worker: `pm2 restart mtms-worker`. |
| Error `Redis connection to 127.0.0.1:6379 failed` | Service Redis tidak berjalan atau firewall memblokir port | Jalankan `sudo systemctl status redis-server` dan `sudo systemctl start redis-server`. |
| Error `current transaction is aborted` pada proses transaksi | Exception database belum di-rollback pada koneksi Kysely | Pastikan stored procedure dan migrasi 040 terbaru sudah terpasang. |
| Penggunaan RAM `mtms-worker` melonjak | Playwright context tidak ditutup saat scraping selesai | Worker sudah dilengkapi `max_memory_restart: '4G'` dan auto-restart berkala. Periksa juga timeout halaman di `lensa-scraper/`. |

---
*Dokumen ini disusun sebagai pedoman implementasi resmi MTMS.*
