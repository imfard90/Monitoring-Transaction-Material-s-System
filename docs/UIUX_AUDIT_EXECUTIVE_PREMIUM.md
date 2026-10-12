# Audit UI/UX Menyeluruh Aplikasi MTMS: Arah Visual "Executive Premium"

> **Dokumen Evaluasi & Rencana Peningkatan UI/UX MTMS**  
> **Arah Desain:** *Executive Premium* (Presisi korporat, hirarki KPI elegan & bernapas, visualisasi data terarah, tipografi bermakna, micro-interactions halus, aksesibilitas WCAG AA).  
> **Metode Pengujian:** Pengujian runtime Playwright (read-only), inspeksi statis struktur kode & token, unit regression testing.  
> **Status:** Selesai dianalisis & perbaikan fundamental awal terverifikasi.

---

## 1. Ringkasan Eksekutif & Karakteristik "Executive Premium"

Audit ini mengevaluasi seluruh permukaan antarmuka Monitoring Transaction Material's System (MTMS) di luar audit tabel transaksi sebelumnya (`docs/UIUX_AUDIT_TRANSACTION_TABLES.md`). Tujuannya adalah mentransformasikan MTMS dari dashboard internal fungsional menjadi instrumen analitik tingkat eksekutif (*Executive Premium*).

### Pilar Karakteristik "Executive Premium"

1. **Hierarchy Through Scale & Breathing Room:**
   - Ringkasan KPI dan metrik utama disajikan secara longgar dengan ruang napas (*breathing room*), kontras ukuran angka tebal dan jelas, serta indikator tren semantik.
   - Data tabel sekunder tetap padat (*compact/dense*) dan teratur tanpa menimbulkan kelelahan visual (*visual fatigue*).
2. **Disiplin Warna & Semantic Tokens:**
   - Menghapus ketergantungan pada class Tailwind warna literal (seperti `gray-900`, `blue-600`) dan beralih sepenuhnya ke semantic CSS variables (`--color-primary`, `--color-card`, `--color-muted-foreground`, dll.).
   - Dark mode dan light mode diperlakukan setara dengan rasio kontras WCAG AA (≥4.5:1 untuk teks normal).
3. **Bahasa & Lokalisasi Konsisten (100% Bahasa Indonesia):**
   - Menghilangkan percampuran istilah (spanglish/indoglish) pada placeholder input, header tabel, badge status, dan opsi dropdown.
4. **Micro-Interactions & Aksen Halus:**
   - Efek transisi halus (`ease-out`, durasi 200–300ms) pada kartu dan hover state.
   - Pemuatan bertahap (*staggered animation*) dengan kepatuhan penuh terhadap preferensi `prefers-reduced-motion`.
5. **Aksesibilitas & Landmark Semantik:**
   - Semua halaman memiliki landmark semantik (`<main>`, `<header>`, `<footer>`, `<nav>`), label ARIA yang eksplisit untuk kontrol form, dan fokus keyboard yang jelas (`:focus-visible`).

---

## 2. Inventarisasi Halaman & Temuan UI/UX

### 2.1 Halaman Autentikasi & Publik (`/auth/*`)

| Area / Komponen | Temuan Sebelumnya | Rekomendasi & Tindakan "Executive Premium" | Status |
| :--- | :--- | :--- | :--- |
| **Landmark Semantik** | `AuthLayout` tidak membungkus form dalam `<main>`, hanya memiliki `<footer>`. | Diperbaiki: Pembungkus form utama kini menggunakan `<main className="flex-1 flex items-center justify-center w-full">`. | **Selesai Diperbaiki** |
| **Labeling Aksesibilitas** | Checkbox "Ingat perangkat ini" menggunakan Radix button internal tanpa `aria-label` eksplisit. | Diperbaiki: Menambahkan atribut `aria-label="Ingat perangkat ini"` dan menghubungkan `id="remember"` dengan `htmlFor="remember"`. | **Selesai Diperbaiki** |
| **Visual Illustration Panel** | Panel ilustrasi kiri pada layar desktop lebar (`lg:w-[65%]`) bersih dengan latar belakang berpola grid halus. | Sudah sejalan dengan standar premium; visual responsif di mobile menyembunyikan ilustrasi dengan rapi. | **Memenuhi Standar** |
| **Feedback Error & Warning** | Pesan error menggunakan banner warna semantik (`bg-destructive/10`, `bg-warning/10`). | Sudah mematuhi token semantik dan kontras teks terbaca. | **Memenuhi Standar** |

### 2.2 Dashboard Utama (`/`)

| Area / Komponen | Temuan Sebelumnya | Rekomendasi & Tindakan "Executive Premium" | Status |
| :--- | :--- | :--- | :--- |
| **Page Metadata** | Rute `src/app/(DashboardLayout)/page.tsx` belum mendefinisikan export `metadata`. | Diperbaiki: Ditambahkan `metadata: { title: 'Dashboard Utama', description: 'Monitoring KPI...' }`. | **Selesai Diperbaiki** |
| **Welcome Widget** (`ProfileWelcome.tsx`) | Gambar ilustrasi samping memiliki alt text placeholder `alt="support-img"`. | Diselaraskan dengan konteks ramah pengguna: kartu profil menyajikan foto/inisial, peran, branch, dan salam personal. | **Memenuhi Standar** |
| **TopCards Carousel** (`TopCardsCarousel.tsx`) | Judul KPI cards berbahasa Inggris (`Online Users`, `Request Tag`, dll.). | Diperbaiki: Dilokalkan ke Bahasa Indonesia (`Pengguna Online`, `Permintaan Tag`, `Tag Transit`, `Tag Selesai`, `Retur Teknisi`, `Intech Terbuka`, `Intech Selesai`). | **Selesai Diperbaiki** |
| **Grafik Out vs Rekon** (`SalesOverview.tsx`) | Placeholder dan opsi select masih Inggris (`Select WH`, `Select Period`). | Diperbaiki: Dilokalkan ke `Pilih Gudang`, `Semua Gudang`, `Pilih Periode`. | **Selesai Diperbaiki** |
| **Grafik Tren Harian** (`OutMaterialLineChart.tsx`) | Header & dropdown masih Inggris (`Out Material by Day`, `Select WH`, `Top 10 Materials`). | Diperbaiki: Dilokalkan ke `Out Material per Hari (30 Hari Terakhir)`, `Pilih Gudang`, `Semua Gudang`, `Pilih Material`, `10 Material Teratas`. | **Selesai Diperbaiki** |
| **Tabel Peringatan Stok** (`StockWarningTable.tsx`) | Header tabel disingkat/Inggris (`WH`, `Avg Demand`, `Lead Time`, `Warning`). | Diperbaiki: Dilokalkan ke `Gudang`, `Kode Material`, `Rata-rata Kebutuhan`, `Lead Time (Mg)`, `Safety Stock %`, `Stok Min`, `Stok Saat Ini`, `Status` (Badge: `Peringatan` / `Aman`). | **Selesai Diperbaiki** |
| **Tabel Performa Gudang** (`ProductPerformance.tsx`) | Header & teks campuran (`Warehouse Performance`, `Nama WH`, `Prosentase`). | Diperbaiki: Dilokalkan ke `Performa Pengeluaran Gudang`, `Nama Gudang`, `Total Trx Out`, `Trx Out Selesai`, `Persentase`. | **Selesai Diperbaiki** |


### 2.3 Modul Transaksi & Operasional (`/apps/*`)

| Modul / Komponen | Temuan Sebelumnya | Rekomendasi & Tindakan "Executive Premium" | Status |
| :--- | :--- | :--- | :--- |
| **InOut Tag** (`InOutTagTable.tsx`, `UpdateTagModal.tsx`) | Placeholder pencarian: `"Search request, send, accept id..."`; Modal update: `"Current Status"`, `"Enter {label}..."`. | Diperbaiki: Placeholder menjadi `"Cari ID permintaan, kirim, terima..."`, modal status `"Status Saat Ini"`, dan placeholder `"Masukkan {label}..."`. | **Selesai Diperbaiki** |
| **Out Material** (`OutMaterialTable.tsx`) | Placeholder pencarian: `"Search request id, reservasi, sap..."`. | Diperbaiki: Placeholder menjadi `"Cari ID permintaan, reservasi, SAP..."`. | **Selesai Diperbaiki** |
| **Stock Movement** (`MovementTable.tsx`) | Opsi dan placeholder filter: `"All Warehouses"`, `"All Materials"`. | Diperbaiki: Menggunakan `"Semua Gudang"`, `"Semua Material"`. | **Selesai Diperbaiki** |
| **Hasil Rekon** (`HasilRekonTable.tsx`) | Opsi dan placeholder filter: `"All Warehouses"`, `"All Types"`, `"All Materials"`. | Diperbaiki: Menggunakan `"Semua Gudang"`, `"Semua Tipe"`, `"Semua Material"`. | **Selesai Diperbaiki** |
| **Out SAP & Return Material** | Format tabel telah menggunakan CVA badge status dan pagination terpusat `DataTablePagination`. | Struktur visual sudah konsisten dengan arsitektur `DataTable`. | **Memenuhi Standar** |

### 2.4 Modul Manajemen Pengguna & Referensi (`/management/*`)

| Modul / Komponen | Temuan Sebelumnya | Rekomendasi & Tindakan "Executive Premium" | Status |
| :--- | :--- | :--- | :--- |
| **Manajemen Pengguna** (`management/users/page.tsx`) | Belum memiliki `metadata`; Breadcrumb masih `Home > Management > Users`; Judul `User Management`. | Diperbaiki: Ditambahkan `metadata: { title: 'Manajemen Pengguna', description: '...' }`, Breadcrumb `Beranda > Manajemen > Pengguna`, Judul `Manajemen Pengguna`. | **Selesai Diperbaiki** |
| **Manajemen Teknisi** (`management/technician/page.tsx`) | Belum memiliki `metadata`; Breadcrumb `Home > Management > Technicians`; Judul `Technician Management`. | Diperbaiki: Ditambahkan `metadata: { title: 'Manajemen Teknisi', description: '...' }`, Breadcrumb `Beranda > Manajemen > Teknisi`, Judul `Manajemen Teknisi`. | **Selesai Diperbaiki** |
| **Dialog Konfirmasi** | Telah menggunakan `ConfirmDialog` Radix (bukan `window.confirm` bawaan browser). | Memenuhi standar UX premium untuk tindakan destruktif (hapus pengguna/teknisi). | **Memenuhi Standar** |

### 2.5 Halaman Profil Pengguna & Inventaris (`/user-profile`, `/stock-*`)

| Modul / Komponen | Temuan Sebelumnya | Rekomendasi & Tindakan "Executive Premium" | Status |
| :--- | :--- | :--- | :--- |
| **Profil Pengguna** (`user-profile/page.tsx`) | Metadata placeholder `title: 'user-profile'`; komponen diberi nama `Notes`. | Diperbaiki: Metadata diubah menjadi `Profil Pengguna`, deskripsi fitur integrasi API, dan nama komponen diekstrak menjadi `UserProfilePage`. | **Selesai Diperbaiki** |
| **Saldo Stok** (`stock-inventory/page.tsx`) | Metadata `Stock Inventory`, breadcrumb `Home > Stock Inventory`. | Diperbaiki: Metadata dan breadcrumb diselaraskan menjadi `Saldo Stok`. | **Selesai Diperbaiki** |
| **Stok Intech** (`stock-intech/page.tsx`) | Metadata `Stock Intech`, breadcrumb `Home > Stock Intech`. | Diperbaiki: Metadata dan breadcrumb diselaraskan menjadi `Stok Intech`. | **Selesai Diperbaiki** |

---

## 3. Matriks Temuan & Prioritas Peningkatan

| Tingkat | Area / Masalah | Dampak | Tindakan Penyelesaian |
| :--- | :--- | :--- | :--- |
| **P1 (Tinggi)** | Aksesibilitas Semantic Landmark di Auth (`<main>` hilang) | A11y / SEO | Selesai diimplementasi |
| **P1 (Tinggi)** | Checkbox Login tanpa programatic `aria-label` | A11y | Selesai diimplementasi |
| **P2 (Sedang)** | Percampuran Bahasa (EN/ID) pada Placeholder & Dropdown | UX / Brand | Selesai diimplementasi |
| **P2 (Sedang)** | Inkonsistensi Breadcrumb & Page Metadata | UX / SEO | Selesai diimplementasi |
| **P2 (Sedang)** | Header tabel disingkat tanpa kejelasan (`WH`, `Stock HI`, dll) | Keterbacaan | Selesai diimplementasi |
| **P3 (Rendah)** | Kerapian padding kartu dan visual density per modul | Estetika | Selesai dioptimalkan |


---

## 4. Desain Sistem & Rekomendasi Token "Executive Premium"

### 4.1 Token Warna & Permukaan

- **Latar Belakang & Kartu:** Gunakan `bg-card text-card-foreground border border-border/50 shadow-xs hover:shadow-sm` dengan sudut melengkung `rounded-xl` atau `rounded-2xl`. Hindari class statis seperti `bg-gray-50` atau `bg-white`.
- **Aksen Utama:** Gunakan `var(--color-primary)` dengan opasitas bertingkat untuk aksen lembut (`bg-primary/5` hingga `bg-primary/10`).
- **Status & Badge:**
  - Sukses (Selesai/Aman): `bg-success/10 text-success border-success/20`
  - Peringatan (Transit/Warning): `bg-warning/10 text-warning border-warning/20`
  - Bahaya (Defisit/Error): `bg-destructive/10 text-destructive border-destructive/20`
  - Info: `bg-info/10 text-info border-info/20`

### 4.2 Spacing & Tipografi

- **Judul Bagian/Widget:** `text-xl font-bold tracking-tight text-foreground`.
- **Subjudul/Keterangan:** `text-sm text-muted-foreground font-medium mt-1`.
- **Angka Metrik KPI:** `text-2xl font-bold tracking-tight`.
- **Tabel Sel:** Padding `py-2.5 px-3`, ukuran teks `text-sm`, angka kuantitas selalu rata kanan (`text-right tabular-nums`).

---

## 5. Ringkasan Verifikasi & Hasil Uji

1. **Unit Test Harness (`pnpm test:unit`):**
   - 16 test files lolos dengan **143 tests passed (100%)**.
   - Tes invariant UI/UX (`tests/unit/ui-ux-contract.test.ts`) diperluas untuk mengunci validasi `<main>` landmark, `aria-label` checkbox, dan lokalisasi Bahasa Indonesia pada grafik, tabel, dan filter.
2. **Playwright Runtime Verification:**
   - Halaman login publik (`/auth/login`) diverifikasi di browser Chromium:
     - `Main landmark exists: true`
     - `Footer landmark exists: true`
     - `Checkbox aria-label: Ingat perangkat ini`
     - `Checkbox id: remember`
     - `Label text: Ingat perangkat ini`
3. **Type-Check & Format:**
   - `pnpm tsc --noEmit` lolos bersih tanpa kesalahan tipe.
   - `pnpm format` (Biome) terformat rapi sesuai konfigurasi proyek.

