# Laporan Audit UI/UX Tabel Transaksi MTMS

> **Tanggal Audit:** 12 Oktober 2026  
> **Aplikasi:** Monitoring Transaction Material's System (MTMS)  
> **Auditor:** Claude Code / AI Specialist  
> **Status:** Selesai & Terimplementasi

---

## 1. Eksekutif Ringkasan

Audit ini memeriksa seluruh 10 antarmuka tabel transaksi di dalam aplikasi MTMS untuk mengevaluasi konsistensi visual, kegunaan (usability), aksesibilitas (a11y), performa, arsitektur data (client vs server pagination), dan konsistensi bahasa (Bahasa Indonesia).

### Status Temuan Utama:
1. **Bahasa Campuran (P0):** Telah diperbaiki. Seluruh header kolom tabel dan label navigasi/filter kini menggunakan **Bahasa Indonesia**.
2. **Arsitektur Pagination Rusak di Ref Lensa (P0):** Telah diperbaiki. Duplikasi `getPaginationRowModel()` pada mode `manualPagination` yang memicu tabel kosong di halaman 2+ telah dihapus.
3. **Filter Gudang Tanpa Sinkronisasi State (P0):** Telah diperbaiki. Penambahan `useEffect` untuk menyinkronkan state lokal dropdown gudang saat URL search parameter berubah.
4. **Peningkatan Komponen Bersama (P1/P2):**
   - `DataTablePagination`: Ditambahkan opsi pemilihan ukuran halaman (*page size selector*), lompat halaman (*page jump input*), dan tombol ke halaman pertama/terakhir (*first/last buttons*).
   - `DataTable`: Penggantian teks pemuatan sederhana dengan baris skeleton modern (`Skeleton`) dan penonaktifan stagger animation pada dataset besar (>25 baris) demi performa render.
5. **Typo Icon Sidebar (P2):** Memperbaiki typo icon `solar:pallete-2-linear` menjadi `solar:palette-2-linear`.
6. **Metadata Judul Halaman (P2):** Seluruh `metadata.title` dan `description` telah diselaraskan ke format Bahasa Indonesia dengan branding konsisten `... | MTMS`.

---

## 2. Rincian Temuan & Perbaikan per Halaman

### 2.1 InOut Tag (`/apps/inout-tag`)
* **Kondisi Sebelum:**
  - Header kolom: *Request Time*, *From WH*, *To WH*, *Request ID*, *Send ID*, *Accept ID*, *Action*.
  - Tombol: *"Create Tag"*, *"Clear all filters"*, *"No tags found."*
* **Perbaikan yang Dilakukan:**
  - Header tabel diubah: `Waktu Permintaan`, `Dari Gudang`, `Tujuan Gudang`, `ID Permintaan`, `ID Kirim`, `ID Terima`, `Aksi`.
  - Tombol dan tooltip diubah: `Buat Tag`, `Hapus semua filter`, `Tidak ada data tag.`.

### 2.2 Out Material (`/apps/out-material`)
* **Kondisi Sebelum:**
  - Header kolom: *Request Time*, *Request ID*, *ID Reservasi*, *SAP Number*, *Action*.
  - Pesan kosong: *"No materials found."*
* **Perbaikan yang Dilakukan:**
  - Header tabel diubah: `Waktu Permintaan`, `ID Permintaan`, `Nomor SAP`, `Aksi`.
  - Pesan dan tooltip diubah: `Hapus semua filter`, `Tidak ada data material.`.

### 2.3 Stock Movement (`/apps/stock-movement`)
* **Kondisi Sebelum:**
  - Header kolom: *Timestamp*, *Reference TRX*, *Warehouse*, *Material Code*, *Description*, *Type*, *Balance*, *Notes*.
  - Pesan & Placeholder: *"Search reference, material, etc..."*, *"All Types"*, *"No movements found."*
* **Perbaikan yang Dilakukan:**
  - Header tabel diubah: `Waktu`, `Referensi TRX`, `Gudang`, `Kode Material`, `Deskripsi Material`, `Tipe`, `Saldo`, `Catatan`.
  - Placeholder & Filter: `Cari referensi, material, dll...`, `Filter Berdasarkan Tipe`, `Tidak ada data pergerakan stok.`.

### 2.4 Hasil Rekon (`/apps/hasil-rekon`)
* **Kondisi Sebelum:**
  - Header kolom: *Timestamp*, *TRX ID*, *SAP Number*, *Warehouse*, *WO Number*, *Material Code*, *Description*, *Qty*, *Action*.
  - Placeholder: *"Search TRX, SAP, NIK, or WO..."*, *"No records found."*
* **Perbaikan yang Dilakukan:**
  - Header tabel diubah: `Waktu`, `ID TRX`, `Nomor SAP`, `Gudang`, `Nomor WO`, `Kode Material`, `Deskripsi`, `Jumlah`, `Aksi`.
  - Placeholder & Status: `Cari TRX, SAP, NIK, atau WO...`, `Hapus semua filter`, `Tidak ada data yang ditemukan.`.

### 2.5 Out Lensa Ref (`/apps/out-lensa-ref`)
* **Kondisi Sebelum:**
  - Bug P0: TanStack `getPaginationRowModel()` aktif bersamaan dengan `manualPagination: true`. Saat berpindah ke halaman 2, TanStack memotong array 20 elemen pada indeks 20–39, menghasilkan array kosong.
  - Bug P0: Filter gudang tidak menyinkronkan state `selectedGudang` saat URL berubah melalui navigasi router.
  - Header kolom: *Reservation ID*, *Resv ID SAP*, *GI Number*.
* **Perbaikan yang Dilakukan:**
  - Menghapus `getPaginationRowModel()` dari inisialisasi `useReactTable()`.
  - Menambahkan `useEffect` untuk menyinkronkan `selectedGudang` dari prop `currentWarehouse`.
  - Menerjemahkan header tabel: `ID Reservasi`, `ID Reservasi SAP`, `Nomor GI`.

### 2.6 WO Lensa Ref (`/apps/wo-lensa-ref`)
* **Kondisi Sebelum:**
  - Bug P0: Sama seperti Out Lensa Ref, `getPaginationRowModel()` aktif pada `manualPagination`.
  - Header kolom: *Type*, *WO Number*, *GI Number*.
* **Perbaikan yang Dilakukan:**
  - Menghapus `getPaginationRowModel()`.
  - Menambahkan sinkronisasi `selectedGudang`.
  - Menerjemahkan header tabel: `Tipe`, `Nomor WO`, `Nomor GI`.

### 2.7 Manajemen Pengguna & Teknisi (`/management/users`, `/management/technician`)
* **Kondisi Sebelum:**
  - `user-table.tsx`: Header dan aksi dalam Bahasa Inggris (*Name*, *Role*, *API Access*, *Delete*). Menggunakan `window.confirm` browser untuk konfirmasi hapus. Menggunakan kelas warna mentah (`border-green-200`, `text-orange-500`).
  - `technician-table.tsx` & `technician-dialog.tsx`: Header Bahasa Inggris (*Service Area*, *Status*, *Action*), tombol *Insert Technician*, dan tombol aksi edit berwarna mentah (`text-blue-500`).
* **Perbaikan yang Dilakukan:**
  - Menyelaraskan seluruh label dan placeholder ke Bahasa Indonesia (*Nama*, *Peran*, *Akses API*, *Hapus*, *Area Layanan*, *Status*, *Tambah Teknisi*, *Edit Teknisi*).
  - Mengganti `window.confirm` dengan modal `ConfirmDialog` terintegrasi.
  - Mengganti utility warna mentah dengan token semantik (`text-success`, `bg-success/10`, `text-warning`, `text-primary`).

### 2.8 Ringkasan Stok (`StockBalanceOverview.tsx`, `StockIntechOverview.tsx`)
* **Kondisi Sebelum:**
  - Tabel saldo stok tidak memiliki pagination, merender seluruh ratusan baris sekaligus ke DOM.
  - Header dan label dalam Bahasa Inggris (*Warehouse*, *Material Code*, *Qty Stock*, *Qty Intech*).
* **Perbaikan yang Dilakukan:**
  - Menambahkan integrasi `getPaginationRowModel()` TanStack Table dan komponen bersama `<DataTablePagination />` (default 20 baris per halaman).
  - Menerjemahkan seluruh header, judul, dan placeholder ke Bahasa Indonesia (*Gudang*, *Kode Material*, *Nama Material*, *Jumlah Stok*, *Jumlah Intech*).
  - Mengganti warna hardcoded `text-blue-600` dengan token semantik `text-primary`.

### 2.9 Formulir & Sub-tabel Transaksi (`ReturnForm`, `OutSapForm`, `RekonIntechForm`, `RekonLensaForm`)
* **Kondisi Sebelum:**
  - Sub-tabel transaksi dan tombol aksi masih dalam Bahasa Inggris (*Return Qty*, *Request Time*, *WO Type*, *Alokasi Used*, *Get Data*, *Review & Submit*).
  - Penggunaan warna mentah (`bg-blue-600`, `text-blue-600`, `bg-amber-50`, `border-amber-300`, `bg-green-500/10`).
* **Perbaikan yang Dilakukan:**
  - Menerjemahkan seluruh sub-tabel, label form, dan pesan modal konfirmasi ke Bahasa Indonesia (*Waktu Permintaan*, *Jumlah Kembali*, *Jumlah Digunakan*, *Alokasi Terpakai*, *Tipe WO*, *Nomor WO*, *Ambil Data*, *Tinjau & Simpan*).
  - Menyelaraskan seluruh styling elemen dengan token semantik (`text-primary`, `bg-warning/10`, `border-warning/40`, `text-success`, `bg-success/10`, `text-destructive`).

---

## 3. Komponen Bersama yang Ditingkatkan

### 3.1 `DataTablePagination.tsx`
* **Fitur Baru:**
  1. **Lompat ke Halaman (*Jump to Page*):** Input angka mini yang memungkinkan pengguna langsung berpindah ke halaman spesifik tanpa perlu mengklik berulang kali.
  2. **Pemilih Ukuran Halaman (*Page Size Selector*):** Opsi 10, 20, 30, 50, dan 100 baris per halaman.
  3. **Persistensi Preferensi Halaman (*Fase 3 UX*):** Menyimpan preferensi ukuran baris pengguna ke `localStorage` (`mtms_table_page_size`) dan memulihkannya secara otomatis saat membuka tabel lain.
  4. **Navigasi Cepat:** Tombol *First Page* (`<<`) dan *Last Page* (`>>`).
  5. **Aksesibilitas:** Menambahkan label ARIA dalam Bahasa Indonesia (`Halaman pertama`, `Halaman sebelumnya`, `Halaman berikutnya`, `Halaman terakhir`).

### 3.2 `DataTable.tsx`
* **Fitur Baru:**
  1. **Skeleton Loader:** Menggantikan teks statis *"Memuat data, mohon tunggu..."* dengan baris-baris `<Skeleton />` yang merepresentasikan struktur tabel yang sedang dimuat, disertai pengumuman ramah pembaca layar (`<span className="sr-only" role="status">Memuat data...</span>`).
  2. **Optimasi Animasi Stagger:** Animasi framer-motion stagger (`delay: i * 0.02`) dinonaktifkan secara otomatis jika jumlah baris melebihi 25, mencegah lag antarmuka pada 50 atau 100 baris data.

### 3.3 `sidebaritems.ts`
* Memperbaiki typo icon Solar: `solar:pallete-2-linear` -> `solar:palette-2-linear`.

---

## 4. Verifikasi dan Quality Check

| Perintah | Hasil | Keterangan |
|---|---|---|
| `pnpm format` | ✅ Lulus | Seluruh file diformat menggunakan Biome (230 files) |
| `pnpm lint` | ✅ Lulus | 0 error pada static linting & a11y checks |
| `pnpm tsc --noEmit` | ✅ Lulus | Strict TypeScript soundness terverifikasi (0 error) |
| `pnpm test:unit` | ✅ Lulus | 138/138 unit tests lulus (termasuk 19 UI/UX contract tests) |

---

## 5. Rekomendasi Jangka Panjang (P3)

1. **Card View Alternatif:** Untuk layar mobile (< 640px), pertahankan pola `InOutTagCards.tsx` dan `OutMaterialCards.tsx` sebagai template responsif untuk tabel-tabel transaksi lainnya.
2. **Ekspor Data:** Tambahkan tombol ekspor Excel seragam di semua tabel transaksi mengikuti pola yang sudah ada di `HasilRekonTable.tsx`.
