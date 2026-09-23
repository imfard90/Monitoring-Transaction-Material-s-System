# MTMS — Business Process Document (Bispro)

> **Version:** 1.1 (Updated)
> **Tanggal:** 2026-09-23
> **Scope:** Seluruh alur proses material dari warehouse ke teknisi hingga pemakaian di lapangan

---

## 1. Gambaran Umum Sistem

MTMS (Monitoring Transaction Material's System) adalah sistem manajemen material yang mengelola seluruh siklus hidup material — mulai dari **penerimaan**, **transfer antar warehouse**, **pengeluaran ke teknisi**, **pemakaian di lapangan**, hingga **pengembalian material** — dengan menjaga integritas stock balance secara real-time.

### Master Data

| Entitas | Tabel | Keterangan |
|---|---|---|
| Warehouse | `inventory.mas_wh` | Gudang penyimpanan material (id, name, branch) |
| Material | `inventory.materials` | Master material/designator (id, code, description, unit) |
| Teknisi | `hr.technicians` | Data teknisi (nik, name, level, branch, mitra) |
| Employee | `hr.employees` | Data karyawan internal |
| Branch | `hr.branches` | Regional → Area → Service Area → Branch |

### Penentuan WH Internal vs External

WH dianggap **external (di luar branch)** berdasarkan data `hr.branches`:
- Bandingkan `mas_wh.branch` dengan branch user/branch WH tujuan
- Jika `branch` WH asal **berbeda** dari branch WH tujuan → WH asal = **external**
- Jika `branch` WH asal **sama** → WH asal = **internal** (stok terkelola, validasi diterapkan)

### Penerimaan Material dari Vendor

Penerimaan material dari vendor **bukan** proses terpisah — ini adalah **InOut Tag biasa** dimana `from_wh_id` (WH Asal) merupakan **WH yang mewakili vendor**. Penamaan WH asal = nama vendor.

Contoh: WH Asal = "PT. Vendor ABC" → WH Tujuan = "Gudang Gresik"

Karena WH vendor **external** (branch berbeda), maka:
- `stock_balance` WH vendor **TIDAK** dikurangi (external WH)
- `stock_balance` WH tujuan **bertambah** (transfer_in)
- Tercatat sebagai `stock_movement` dengan notes "External WH - balance not tracked"

### Jenis Pergerakan Stok (`enum_stock_movement`)

| Movement Type | Efek Balance | Keterangan |
|---|---|---|
| `opening_balance` | ✅ Set/Replace | Saldo awal / migrasi data |
| `receive` | ✅ Tambah (+) | Penerimaan dari vendor (via InOut Tag) |
| `transfer_out` | ✅ Kurang (-) | Transfer keluar via InOut Tag |
| `transfer_in` | ✅ Tambah (+) | Transfer masuk via InOut Tag |
| `sap_out` | ✅ Kurang (-) | Pengeluaran SAP ke teknisi |
| `return` | ✅ Tambah (+) | Teknisi kembalikan material ke WH |
| `adjustment` | ✅ ± | Koreksi manual / stock opname |
| `material_used` | ❌ Audit only | Pemakaian di WO (tidak ubah balance) |

### Authorization (RBAC)

> 🔜 **Coming Soon** — Seluruh modul sementara bisa diakses oleh semua user. Nantinya akan di-setting via Role-Based Access Control (RBAC) untuk membatasi aksi per role user.

---

## 2. Standardisasi ID Transaksi (Format Sequence)

Untuk memudahkan traceability dan mencegah bentrok data, sistem menggunakan penomoran transaksi terstandar dengan pola _Sequence_ khusus. Nomor urut di belakang menggunakan format `YYMM0000x` (contoh `260900001` untuk bulan September 2026), sehingga urutan otomatis reset tiap bulan dan tidak akan kehabisan *digit*.

| Modul | Format ID Transaksi | Keterangan |
|---|---|---|
| **InOut Tag** | `TRX-TAG-'intsl wh asal'-'intsl wh tujuan'-YYMM0000x` | Dibuat oleh SP `sp_create_inout_tag`. `intsl wh` diambil dari inisial Gudang pada tabel `mas_wh`. |
| **Out SAP** | `TRX-OUT-'intsl wh'-'nik teknisi'-YYMM0000x` | Dibuat di server action `createOutSap`. |
| **Return Teknisi** | `TRX-RETURN-'nik teknisi'-'intsl wh'-YYMM0000x` | Dibuat di SP `sp_return_material`. |
| **Transaction Used** | `TRX-USED-'nik teknisi'-'sap number'-'workorder'-YYMM0000x` | Dibuat di server action `createTransactionUsed`. |

---

## 3. Alur Proses Bisnis

### 2.1 Transaksi InOut Tag (Transfer Antar Warehouse)

> **Tujuan:** Memindahkan material dari WH Asal ke WH Tujuan.
> Termasuk penerimaan dari vendor (WH Asal = WH vendor).

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   REQUESTED  │────▶│  IN_TRANSIT   │────▶│    CLOSED     │     │    CANCEL     │
│  (create)    │     │  (request)    │     │  (accept)     │     │  (cancel)     │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
  create tag           send items          accept items
  + vendor info        + send_id           + accept_id
  + items (req)        + items (send)      + items (accept)
                                                 │
                                      ┌──────────┴──────────┐
                                      │ sp_close_inout_tag() │
                                      │                      │
                                      │ • transfer_out       │
                                      │   dari WH Asal       │
                                      │   (stock -)          │
                                      │                      │
                                      │ • transfer_in        │
                                      │   ke WH Tujuan       │
                                      │   (stock +)          │
                                      └─────────────────────┘
```

#### Aturan Bisnis:

1. **Status Flow:** `requested` → `in_transit` → `closed` | `cancel`
2. **Anti-Rollback:** Transaksi yang sudah `closed` atau `cancel` tidak bisa diubah
3. **Stock Balance Update** hanya terjadi saat status berubah ke `closed` (accept)
4. **Validasi Stok WH Asal — Dilakukan Saat Accept:**
   - ✅ **WH Asal internal (branch sama):** Cek `stock_balance` saat **accept** — jika stok < qty permintaan → **TOLAK** transaksi
   - ⚠️ **WH Asal external (branch beda, termasuk vendor):** Catat `stock_movement` dengan notes *"External WH - balance not tracked"*, `qty_after = 0`, **TIDAK** mengurangi `stock_balance`
   - ℹ️ Penentuan internal/external: bandingkan `mas_wh.branch` via tabel `hr.branches`
5. **Transfer In (WH Tujuan):** Selalu upsert — jika belum ada row di `stock_balance`, buat baru
6. **Vendor Tracking:** Setiap InOut Tag bisa dikaitkan dengan vendor dan cost via `inventory.vendor_tracking`
7. **3 fase item:** `request items` → `send items` → `accept items` — qty bisa berbeda di setiap fase

---

### 2.2 Transaksi Out SAP (Pengeluaran Material ke Teknisi)

> **Tujuan:** Mengeluarkan material dari WH ke tangan teknisi

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ WAIT_APPROVE │────▶│   REQUEST    │────▶│    INTECH     │────▶│    CLOSE      │
│              │     │              │     │ (di teknisi)  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                │                      │
                                           sp_sap_out()          auto-close saat
                                           stock -= qty_req      semua item selesai
```

#### Data Header (`sap_out_header`):

| Field | Keterangan |
|---|---|
| `id_trx` | ID transaksi unik |
| `nik_teknisi` | NIK teknisi penerima → FK ke `hr.technicians` |
| `name_sa` | Nama Service Area |
| `warehouse_id` | WH asal pengeluaran (wajib untuk pengurangan balance) |
| `id_reservasi` | Nomor reservasi SAP |
| `sap_number` | Nomor SAP (digunakan untuk mapping ke Work Order) |
| `request_id` | ID request |
| `end_status` | `wait_approve` → `request` → `intech` → `close` |

#### Data Items (`sap_out_items`):

| Field | Keterangan |
|---|---|
| `designator_id` | Material yang dikeluarkan |
| `qty_req` | Jumlah yang diminta/dikeluarkan |
| `qty_used` | Jumlah yang sudah diselesaikan (terpakai + dikembalikan) |
| `unit_price` | Harga satuan |

#### Aturan Bisnis:

1. **Stock Balance** dikurangi saat status berubah ke `intech` (material sudah di tangan teknisi) — via `sp_sap_out()`
2. **Validasi Stok:** Jika stok di WH < qty yang diminta → **RAISE EXCEPTION** (transaksi gagal)
3. **Status item:** `close` jika `qty_req == qty_used`, else `intech` (masih di tangan teknisi)
4. **`qty_used` = total yang sudah diselesaikan**, mencakup:
   - Material yang **terpakai** (via transaction_used)
   - Material yang **dikembalikan** (via return material)
5. **Auto-close header:** Saat **semua item** memiliki `qty_req == qty_used` → status header otomatis `close`
6. **Relasi Teknisi:** Setiap transaksi Out SAP harus terkait dengan teknisi terdaftar (`hr.technicians`)
7. **Authorization:** Sementara semua user bisa mengoperasikan. 🔜 Nantinya via RBAC.

---

### 2.3 Return Material (Pengembalian dari Teknisi ke WH)

> **Tujuan:** Teknisi mengembalikan material yang tidak terpakai ke warehouse.
> **Prinsip:** Setiap stock WH bertambah dari return, **HARUS ada `accept_id`** — artinya pihak WH harus menerima/accept dulu.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   TEKNISI       │     │    PENDING      │     │   ACCEPTED      │
│  (submit return)│────▶│  (menunggu WH   │────▶│  (WH terima)    │
│                 │     │   accept)       │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                              ┌──────────┴──────────┐
                                              │ sp_return_material() │
                                              │                      │
                                              │ • stock_balance WH   │
                                              │   += qty_return      │
                                              │                      │
                                              │ • stock_movement     │
                                              │   (type: return)     │
                                              │                      │
                                              │ • sap_out_items      │
                                              │   qty_used += qty    │
                                              └─────────────────────┘
```

#### Struktur Data Return (Perlu Tabel Baru):

**Header (`inventory.return_material_header`):**

| Field | Keterangan |
|---|---|
| `id` | PK, auto-increment |
| `id_trx` | ID transaksi return unik |
| `sap_out_id` | FK ke `sap_out_header.id` — sumber material asal |
| `nik_teknisi` | NIK teknisi yang mengembalikan |
| `warehouse_id` | WH tujuan return (WH yang menerima material kembali) |
| `end_status` | `pending` → `accepted` \| `rejected` |
| `accept_id` | ID user yang accept (wajib ada saat accepted) |
| `accept_time` | Timestamp saat diterima |
| `notes` | Catatan alasan return |
| `created_at` | Timestamp submit |
| `created_by` | User yang submit |

**Items (`inventory.return_material_items`):**

| Field | Keterangan |
|---|---|
| `id` | PK, auto-increment |
| `header_id` | FK ke `return_material_header.id` |
| `designator_id` | Material yang dikembalikan |
| `sap_out_item_id` | FK ke `sap_out_items.id` — item spesifik dari Out SAP |
| `qty` | Jumlah yang dikembalikan |

#### Aturan Bisnis:

1. **Wajib Accept:** Stock WH **hanya bertambah** setelah pihak WH meng-accept return (status `accepted`)
2. **Referensi Out SAP:** Return **HARUS** mereferensikan `sap_out_id` — menunjukkan material berasal dari pengeluaran mana
3. **Validasi qty:** `qty_return` ≤ `qty_req - qty_used` (tidak boleh return melebihi sisa di tangan teknisi)
4. **Efek saat Accepted:**
   - `stock_balance` WH tujuan += qty_return (via `sp_return_material`)
   - `sap_out_items.qty_used` += qty_return (material "sudah diselesaikan" dari tangan teknisi)
   - `stock_movement` tercatat dengan `movement_type = 'return'`
5. **Traceability:** `reference_trx` di `stock_movement` mengacu ke `id_trx` dari return header
6. **Auto-close Out SAP:** Setelah return diproses, cek apakah semua item Out SAP sudah `qty_req == qty_used` → jika ya, auto-close Out SAP header

---

### 2.4 Transaksi Used (Pemakaian Material di Lapangan)

> **Tujuan:** Mencatat material yang digunakan teknisi di Work Order (WO).
> **Prinsip:** 1 WO bisa menggunakan material dari **banyak Out SAP** yang berbeda.

```
┌─────────────────┐     ┌──────────────────────────┐
│  sap_out_header  │     │ transaction_used_header   │
│  #1 (SAP-001)   │────▶│                          │
│                  │     │ • sap_out_id = #1        │
└─────────────────┘     │ • wo_number = WO-12345   │
                         └────────────┬─────────────┘
┌─────────────────┐                   │
│  sap_out_header  │     ┌────────────┴─────────────┐
│  #2 (SAP-002)   │────▶│ transaction_used_header   │
│                  │     │                          │
└─────────────────┘     │ • sap_out_id = #2        │
                         │ • wo_number = WO-12345   │  ← WO yang sama, SAP berbeda
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │ transaction_used_item     │
                         │                          │
                         │ • designator_id          │
                         │ • qty (jumlah terpakai)  │
                         │ • unit_price             │
                         │ • used_id (FK header)    │
                         └──────────────────────────┘
```

#### Struktur Data:

**Header (`transaction_used_header`):**

| Field | Keterangan |
|---|---|
| `id_trx` | ID transaksi unik (format `TRX-USED-...`) |
| `sap_out_id` | FK ke `sap_out_header.id` — **sumber material spesifik** |
| `wo_number` | Nomor Work Order (input manual) |
| `wo_type` | Tipe WO: `psb`, `assurance`, `myrep`, `qe/gamas`, `mtel`, `lintas_arta` |
| `nik_teknisi` | FK ke `hr.technicians.nik` |
| `name_sa` | Nama Service Area |
| `name_wh` | Nama Warehouse |

**Items (`transaction_used_item`):**

| Field | Keterangan |
|---|---|
| `used_id` | FK ke `transaction_used_header.id` |
| `designator_id` | Material yang dipakai |
| `qty` | Jumlah yang dipakai |
| `unit_price` | Harga satuan |

#### Mapping SAP ↔ Work Order (Konsistensi Data):

Karena 1 WO bisa menggunakan material dari banyak Out SAP:

```
WO-12345 ─── transaction_used_header #1 (sap_out_id = SAP-001)
         │     └── item: Kabel FO, qty: 10
         │     └── item: Konektor, qty: 5
         │
         └── transaction_used_header #2 (sap_out_id = SAP-002)
               └── item: ODP Box, qty: 2
```

**Aturan konsistensi:**
1. Saat membuat transaction_used, user **pilih Out SAP dulu** → kemudian pilih material dari item Out SAP tersebut
2. `wo_number` dan `wo_type` harus **konsisten** di semua header yang mereferensikan WO yang sama
3. Material yang dicatat **harus ada** di `sap_out_items` dari Out SAP yang dipilih
4. `qty` yang dicatat **tidak boleh melebihi** `qty_req - qty_used` di `sap_out_items`
5. Setelah insert, update `sap_out_items.qty_used` += qty

**View/Query untuk melihat total pemakaian per WO:**

```sql
-- Total material per WO dari semua sumber Out SAP
SELECT
    tuh.wo_number,
    tuh.wo_type,
    m.code AS material_code,
    m.description,
    SUM(tui.qty) AS total_qty_used,
    tuh.sap_out_id,
    soh.sap_number
FROM inventory.transaction_used_header tuh
JOIN inventory.transaction_used_item tui ON tui.used_id = tuh.id
JOIN inventory.materials m ON m.id = tui.designator_id
JOIN inventory.sap_out_header soh ON soh.id = tuh.sap_out_id
WHERE tuh.wo_number = 'WO-12345'
GROUP BY tuh.wo_number, tuh.wo_type, m.code, m.description, tuh.sap_out_id, soh.sap_number
ORDER BY soh.sap_number, m.code;
```

#### Aturan Bisnis:

1. **Relasi ke Out SAP:** Setiap transaksi used **HARUS** mereferensikan `sap_out_id` — sehingga terlihat jelas material berasal dari pengeluaran Out SAP yang mana
2. **1 WO = banyak Out SAP:** Teknisi bisa melaporkan pemakaian dari beberapa Out SAP untuk 1 WO yang sama (1 header per sap_out_id per WO)
3. **Tidak Mengubah stock_balance:** Stok sudah dikurangi saat `sap_out` — transaksi used hanya audit trail (`sp_record_material_used`)
4. **Update `qty_used`:** Setelah insert transaksi used, update `sap_out_items.qty_used` += qty yang dipakai
5. **WO Number:** Input manual oleh user (🔜 integrasi KPRO di tahap pengembangan selanjutnya)
6. **WO Type:** `psb`, `assurance`, `myrep`, `qe/gamas`, `mtel`, `lintas_arta`
7. **Traceability:** Dari WO → bisa di-trace balik ke Out SAP → ke WH asal → ke InOut Tag asal (jika ada)

---

### 2.5 Stock Balance & Stock Movement

> **Tujuan:** Single source of truth untuk saldo stok dan histori pergerakan

#### Stock Balance (`inventory.stock_balance`):

```
┌─────────────────────────────────────────┐
│ stock_balance                            │
│                                          │
│  UNIQUE(warehouse_id, designator_id)     │
│  CHECK(qty_stock >= 0)                   │
│                                          │
│  Satu material hanya punya 1 baris       │
│  per warehouse                           │
└─────────────────────────────────────────┘
```

- **Diupdate atomik** oleh Stored Procedures — aplikasi **TIDAK** boleh update langsung
- **Constraint:** Stok tidak boleh negatif (`qty_stock >= 0`)

#### Stock Movement (`inventory.stock_movement`):

Setiap perubahan `stock_balance` menghasilkan 1 baris di `stock_movement`:

| Field | Keterangan |
|---|---|
| `movement_type` | Jenis pergerakan (enum) |
| `qty_delta` | Perubahan qty (+/-), tidak boleh 0 |
| `qty_after` | Saldo setelah pergerakan |
| `reference_trx` | Referensi ke transaksi sumber (id_trx) |
| `notes` | Catatan tambahan |
| `created_by` | User yang membuat transaksi |

---

### 2.6 Stock Balance Teknisi

Material yang sudah keluar via Out SAP menjadi **"stock di tangan teknisi"** yang bisa dihitung dari:

```
sisa_di_teknisi (per item) = qty_req - qty_used
```

Dimana `qty_used` bertambah dari:
- **Transaksi Used:** Material dipakai di WO → `qty_used` += qty_used
- **Return Material (accepted):** Material dikembalikan ke WH → `qty_used` += qty_return

**Saat `qty_used == qty_req`** untuk semua item → Out SAP header **auto-close**.

**Rumus keseluruhan per teknisi:**

```
total_stock_teknisi = Σ(sap_out_items.qty_req) - Σ(sap_out_items.qty_used)
                      (dari semua Out SAP berstatus intech milik teknisi tersebut)
```

---

## 3. Stored Procedures

Semua perubahan stok di-handle oleh stored procedures untuk menjamin **atomicity** dan **data integrity**:

| Procedure | Dipanggil Saat | Efek |
|---|---|---|
| `sp_opening_balance` | Migrasi saldo awal | Upsert balance + movement |
| `sp_adjustment` | Stock opname / koreksi | ± balance + movement |
| `sp_sap_out` | Out SAP → intech | Kurangi balance + movement per item |
| `sp_return_material` | Return accepted | Tambah balance + movement + update qty_used |
| `sp_close_inout_tag` | InOut Tag accept/closed | Transfer out (conditional) + Transfer in |
| `sp_record_material_used` | Transaksi used di WO | Movement only (no balance) + update qty_used |
| `sp_receive_material` | _(legacy, diganti InOut Tag dari vendor)_ | Tambah balance + movement |
| `sp_create_inout_tag` | Buat InOut Tag baru | Create header + items |
| `sp_update_inout_tag` | Update fase InOut Tag | Update status + items + panggil sp_close |

---

## 4. Diagram Alur End-to-End

```
  ┌──────────┐         ┌──────────────┐        ┌──────────────┐
  │  VENDOR  │────────▶│   WAREHOUSE  │───────▶│   TEKNISI    │
  │ (WH Asal │ InOut   │   (WH Asal)  │ sap_out│              │
  │  = Vendor)│ Tag    └──────┬───────┘        └──────┬───────┘
  └──────────┘               │                       │
                   InOut Tag │                       │ transaction_used
                 (transfer)  │                       │ (WO: PSB/Assurance/etc.)
                             ▼                       ▼
                      ┌──────────────┐        ┌──────────────┐
                      │   WAREHOUSE  │        │  WORK ORDER  │
                      │  (WH Tujuan) │        │  (Lapangan)  │
                      └──────────────┘        └──────┬───────┘
                                                     │
                                              return │ (sisa material)
                                              accept │ (WH terima)
                                                     ▼
                                              ┌──────────────┐
                                              │   WAREHOUSE  │
                                              │  (return WH)  │
                                              └──────────────┘
```

### Lifecycle Material:

```
Vendor (WH) ──InOut Tag──▶ WH ──transfer──▶ WH2 ──sap_out──▶ Teknisi
                                                                  │
                                                            ┌─────┴─────┐
                                                            ▼           ▼
                                                      used (WO)    return (WH)
                                                                   + accept_id
```

---

## 5. Fitur yang Sudah Diimplementasikan

| Modul | Status | UI | Server Action | Stored Procedure |
|---|---|---|---|---|
| InOut Tag (Create) | ✅ Done | CreateTagModal | createTag | sp_create_inout_tag |
| InOut Tag (Update: request/send/accept) | ✅ Done | UpdateTagModal | updateTag | sp_update_inout_tag |
| InOut Tag (Cancel) | ✅ Done | InOutTagTable | cancelTag | Direct update |
| InOut Tag (Detail View) | ✅ Done | InOutTagDetailModal | getInoutTagItemsByHeaderId | — |
| Out Material (List + Detail) | ✅ Done | OutMaterialTable + DetailModal | getOutMaterials, getOutMaterialItems | — |
| Stock Balance | ✅ DB Ready | ❌ No UI | — | sp_opening_balance, sp_adjustment |
| Stock Movement | ✅ DB Ready | ❌ No UI | — | Auto-insert by SPs |
| Out SAP Process | ✅ SP Ready | ❌ No UI (create/close) | ❌ No Action | sp_sap_out |
| Return Material | ⚠️ Partial | ❌ No UI | ❌ No Action | sp_return_material (perlu tabel baru + accept flow) |
| Transaction Used | ✅ DB Ready | ❌ No UI | ❌ No Action | sp_record_material_used |
| Receive Material | ℹ️ Via InOut Tag | — | — | InOut Tag dari WH vendor |

---

## 6. Keputusan Proses yang Sudah Disepakati

Ringkasan dari Q&A klarifikasi proses:

| # | Keputusan | Detail |
|---|---|---|
| 1 | Validasi stok InOut Tag | **Saat accept** — paling akurat, cek di tahap akhir |
| 2 | Role/operator tiap modul | **Sementara semua user** — RBAC coming soon |
| 3 | Return vs qty_used | Return **menambah** `qty_used` — artinya material "sudah diselesaikan" dari tangan teknisi. Stock WH bertambah, stock teknisi berkurang |
| 4 | Return perlu tabel terpisah | **Ya, menyesuaikan** — butuh tabel return_header/items dengan accept flow karena setiap penambahan stock WH dari return wajib ada `accept_id` |
| 5 | 1 WO banyak Out SAP | **Bisa** — 1 WO bisa memiliki banyak transaction_used_header dari sap_out_id berbeda. Perlu mapping `sap_number ↔ wo_number` untuk konsistensi |
| 6 | Sumber data WO | **Input manual** — integrasi KPRO di tahap pengembangan selanjutnya |
| 7 | Authorization | **RBAC coming soon** — sementara open access |
| 8 | Penerimaan dari vendor | **WH asal = vendor** — bukan proses terpisah, pakai InOut Tag biasa |
| 9 | WH internal vs external | **Berdasarkan `hr.branches`** — bandingkan branch WH asal dan WH tujuan |
| 10 | Material rekonsiliasi | **Diabaikan dulu** — tidak termasuk scope bispro saat ini |

---

## 7. Rekomendasi Pengembangan Selanjutnya

### Prioritas Tinggi (Core Flow)

1. **UI + Action: Out SAP Create/Update** — Agar admin bisa membuat dan memproses pengeluaran material ke teknisi
2. **Tabel + SP + UI: Return Material** — Buat tabel `return_material_header` & `return_material_items`, SP update, dan UI dengan accept flow
3. **UI + Action: Transaction Used** — Agar teknisi/admin bisa melaporkan pemakaian material per WO dengan pilihan Out SAP sumber
4. **Dashboard Stock Balance** — Monitoring real-time stok per warehouse

### Prioritas Sedang (Traceability & Reporting)

5. **Stock Movement Log Viewer** — Histori lengkap pergerakan material
6. **Laporan Stock Balance Teknisi** — Material yang masih di tangan teknisi per NIK
7. **Laporan Pemakaian per WO** — Detail material per work order + sumber Out SAP

### Prioritas Rendah (Enhancement)

8. **Stock Opname / Adjustment UI** — Koreksi manual
9. **RBAC** — Role-based access control per modul
10. **Integrasi WO dari KPRO** — Autocomplete wo_number dari data_kpro

---

> **Catatan:** Dokumen ini adalah referensi utama untuk menjaga konsistensi proses dan keakuratan data. Setiap perubahan proses bisnis harus tercermin di dokumen ini sebelum implementasi.
