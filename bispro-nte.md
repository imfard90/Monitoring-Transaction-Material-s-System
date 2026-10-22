# MTMS — Business Process Document: NTE (Network Terminal Equipment)

> **Version:** 1.1
> **Tanggal:** 2026-10-19
> **Scope:** Transaksi material NTE (ONT, SetTopBox) — gudang hingga teknisi/customer
> **Parent:** `bispro.md` (base process); dokumen ini spesifik NTE

---

## 1. Gambaran Umum

NTE adalah modul transaksi untuk perangkat Network Terminal Equipment (misal ONT, SetTopBox) yang pergerakannya dikelola per Serial Number (SN), bukan per quantity. Setiap SN memiliki lifecycle: warehouse → technician → installation → (return) → warehouse/customer.

Tidak ada stock balance per quantity. Yang berubah adalah lokasi (`address`) dan status dari setiap SN secara individual.

---

## 2. Master Data

### 2.1 Schema & Tabel

| Entitas | Tabel | Keterangan |
|---|---|---|
| Item Model | `nte_inventory.mas_item_nte` | Master tipe perangkat (type, merek, type_sn) |
| Address/Lokasi | `nte_inventory.mas_address_nte` | Master lokasi + owner (telkom/tif/tsel) |
| SN Inventory | `nte_inventory.mas_sn_nte` | Per SN: serial_number, item, owner, **wo_number / inet_number**, inventory_status, condition_status |
| Transaction Log | `nte_inventory.log_transaction_nte` | History setiap transaksi per SN |

### 2.2 Enum Values

**`inventory_status`** — kondisi keberadaan fisik:
- `available` — ada di warehouse, siap dipakai
- `unavailable` — keluar warehouse (di teknisi)
- `installed` — sudah terpasang di customer

**`condition_status`** — kondisi fisik perangkat:
- `normal` — baik
- `damage` — rusak
- `refurbish` — refurbish

**`owner`** (per address, enum):
- `telkom`
- `tif`
- `tsel`

**`type_transaksi`** (enum):
- `stock_transfer` — antar warehouse
- `send_to_technician` — dari warehouse ke teknisi
- `installation` — dari teknisi ke customer (WO)
- `return_from_technician` — return dari teknisi ke warehouse

**`location_type`** (per address):
- `warehouse` — gudang
- `customer` — lokasi customer (saat installed, field `address` digantikan oleh `wo_number`/`inet_number`)

### 2.3 Address List

| address_name | owner | location_type | UI Label |
|---|---|---|---|
| ta_witel_ccan_sby_utara | telkom | warehouse | Witel SBY Utara |
| ta_so_ccan_bambe_wh | telkom | warehouse | Karangpilang |
| ta_so_ccan_gresik_wh | telkom | warehouse | SO CCAN Gresik |
| ta_so_ccan_lamongan_wh | telkom | warehouse | SO CCAN Lamongan |
| ta_so_ccan_bojonegoro_wh | telkom | warehouse | SO CCAN Bojonegoro |
| ta_so_ccan_tuban_wh | telkom | warehouse | SO CCAN Tuban |
| tif_district_lamongan_wh | tif | warehouse | TIF District Lamongan |
| tif_so_bambe_wh | tif | warehouse | TIF SO Karangpilang |
| tif_so_gresik_wh | tif | warehouse | TIF SO Gresik |
| tif_so_lamongan_wh | tif | warehouse | TIF SO Lamongan |
| tif_so_bojonegoro_wh | tif | warehouse | TIF SO Bojonegoro |
| tif_so_tuban_wh | tif | warehouse | TIF SO Tuban |
| ta_witel_inv_sby_utara | tsel | warehouse | Tsel Witel SBY Utara |
| ta_so_inv_bambe_wh | tsel | warehouse | Tsel Inv Karangpilang |
| ta_so_inv_gresik_wh | tsel | warehouse | Tsel Inv Gresik |
| ta_so_inv_lamongan_wh | tsel | warehouse | Tsel Inv Lamongan |
| ta_so_inv_bojonegoro_wh | tsel | warehouse | Tsel Inv Bojonegoro |
| ta_so_inv_tuban_wh | tsel | warehouse | Tsel Inv Tuban |

> **Catatan:** `bambe` = `karangpilang`. Gunakan `karangpilang` di UI. Address tersimpan `ta_so_ccan_bambe_wh`.

### 2.4 Item Description Format

Pattern: `{TYPE};{MEREK}_{TYPE_SN}`

Contoh:
- `ONT;HUAWEI_HG8245H5`
- `STB;ZTE_ZXV10B860HV5`

### 2.5 Serial Number Prefix Pattern

SN mengikuti pola prefix untuk search dan filter:

| Tipe | Prefix Pattern | Contoh SN |
|---|---|---|
| ONT | `SN` + 2 huruf model + 8 digit acak | `SNHG8245H5XXXXXXXX` |
| STB | `SN` + 3 huruf model + 8 digit acak | `SNZXV10B860XXXXXXXX` |

Prefix lookup digunakan di:
- Dropdown search filter asal
- Dropdown search filter tujuan
- Filter item_description

### 2.6 Address Column di mas_sn_nte

Kolom `address` di `mas_sn_nte` **dipecah** menjadi:
- **`wo_number`** — WO number saat status `installed`
- **`inet_number`** — Nomor Inet / customer saat status `installed`

Saat status **bukan** `installed`, field `wo_number` dan `inet_number` = NULL, dan lokasi tracked via kolom `address` yang merujuk ke `mas_address_nte.address_name`.

---

## 3. Format ID Transaksi

Setiap transaksi menghasilkan `id_transaksi` dengan format sequence `YYYYMMDDxxxxx` (5 digit, reset harian):

| type_transaksi | Format id_transaksi |
|---|---|
| stock_transfer | `WH-WH_{asal}-{tujuan}-{YYYYMMDDxxxxx}` |
| send_to_technician | `WH-TECH_{asal}-{nik_teknisi}-{YYYYMMDDxxxxx}` |
| installation | `INS_{wo_number}-{YYYYMMDDxxxxx}` |
| return_from_technician | `TECH-WH_{nik_teknisi}-{tujuan}-{YYYYMMDDxxxxx}` |

Sequence: `nte_inventory.trx_nte_seq` (format `YYYYMMDDFM0000x`), satu sequence untuk semua tipe.

---

## 4. Alur Transaksi

### 4.1 Stock Transfer (WH → WH)

TAG WH-WH memiliki **3 subtype** berdasarkan klasifikasi warehouse asal dan tujuan. Sistem mendeteksi secara otomatis di SP berdasarkan prefix `address_name`.

**Klasifikasi SO vs NONSO:**

| Klasifikasi | Owner | Prefix Pattern | Contoh |
|-------------|-------|----------------|--------|
| **SO** | `telkom` | `ta_so_*` atau `ta_witel_ccan_*` | `ta_so_ccan_bambe_wh`, `ta_witel_ccan_sby_utara` |
| **NONSO** | `tif` / `tsel` | `tif_*` atau `ta_witel_inv_*` | `tif_district_lamongan_wh`, `ta_witel_inv_sby_utara` |

**3 Subtype TAG WH-WH:**

| Subtype | Asal | Tujuan | Payload SN | Validasi SN di WH Asal | Efek pada `mas_sn_nte` | Log |
|---------|------|--------|------------|------------------------|------------------------|-----|
| **Inter-SO** | SO | SO | `string[]` | ✅ cek existing | UPDATE `address` → WH tujuan | TAG keluar + masuk |
| **Dari-SO** | SO | NONSO | `string[]` | ✅ cek existing | Address TIDAK berubah | TAG keluar |
| **Ke-SO** | NONSO | SO | `[{serial_number, item_description}]` | ❌ tidak | INSERT new SN | TAG masuk |

**Alur UI per Subtype:**

```
Inter-SO / Dari-SO:
  User → Pilih asal (SO warehouse)
  → Pilih tujuan
  → Input SN (manual / mass upload .txt)
  → Submit
  → Payload: string[]
  → SP: validasi SN existing di WH asal
  → Inter-SO: update mas_sn_nte.address
  → Dari-SO: address tetap, hanya log TAG keluar

Ke-SO:
  User → Pilih asal (NONSO warehouse)
  → Pilih tujuan (SO warehouse)
  → Input SN + item_description (mass upload)
  → Submit
  → Payload: [{serial_number, item_description}]
  → SP: INSERT new SN, address = WH tujuan
  → Log TAG masuk
```

**Mass Upload (Inter-SO / Dari-SO):**
- Input: file `.txt` berisi serial numbers (satu SN per baris)
- Payload dikirim sebagai `string[]` (tanpa `item_description`)
- Jika SN tidak ditemukan → reject baris, tampilkan list SN gagal

**Mass Upload (Ke-SO):**
- Input: file `.txt` + dropdown `item_description`
- Payload: `[{serial_number, item_description}]`
- Setiap SN di-INSERT sebagai record baru

**Validasi (Inter-SO / Dari-SO):**
- SN harus `inventory_status = 'available'` dan `condition_status != 'damage'` di address asal
- Address asal harus sesuai scope user (§6)

**Validasi (Ke-SO):**
- `item_description` wajib valid
- Tidak perlu cek SN existing di WH asal


### 4.2 Send to Technician (WH → Teknisi)

```
User → Create Tag (send_to_technician)
  → Pilih asal (dropdown search address warehouse)
  → Input NIK teknisi (dropdown dari hr.technicians, search by NIK/nama)
  → Input SN (manual / mass upload)
  → Submit
  → SP: update mas_sn_nte.address = NIK teknisi, inventory_status = 'unavailable'
  → SP: insert log_transaction_nte
```

### 4.3 Installation (Teknisi → Customer) — UI Set Install

```
User → Set Install Form
  → Input WO Number
  → Input No. Inet / Customer
  → Input SN (manual / mass upload .txt)
  → Submit
  → SP: update mas_sn_nte.inventory_status = 'installed', wo_number, inet_number
  → SP: insert log_transaction_nte
```

### 4.4 Return from Technician (WH) — UI Return NTE

```
User → Return NTE Form
  → Input NIK teknisi (dropdown, search)
  → Pilih tujuan warehouse (dropdown search address)
  → Input SN (manual / mass upload)
  → Submit
  → SP: update mas_sn_nte.address = address tujuan, inventory_status = 'available'
  → SP: insert log_transaction_nte
```

---

## 5. UI Structure

### 5.1 Menu: `Apps > NTE Transaction`

Terdapat 3 halaman terpisah:

```
nte-transaction/
├── tag/                         # UI 1: TAG (tabel transaksi + create tag)
│   ├── _actions/
│   │   ├── nte-tag-actions.ts
│   │   ├── nte-tag-queries.ts
│   │   └── nte-tag-commands.ts
│   ├── _components/
│   │   ├── NteTagClient.tsx
│   │   ├── NteTagTable.tsx         (TanStack Table, filter by SN, periode)
│   │   ├── NteTagDetailModal.tsx
│   │   ├── CreateTagModal.tsx
│   │   └── MassUploadModal.tsx
│   └── page.tsx
├── set-install/                  # UI 2: SET Install (form section)
│   ├── _actions/
│   │   ├── nte-install-actions.ts
│   │   ├── nte-install-queries.ts
│   │   └── nte-install-commands.ts
│   ├── _components/
│   │   ├── SetInstallClient.tsx
│   │   └── SetInstallForm.tsx
│   └── page.tsx
└── return-nte/                  # UI 3: Return NTE (form section)
    ├── _actions/
    │   ├── nte-return-actions.ts
    │   ├── nte-return-queries.ts
    │   └── nte-return-commands.ts
    ├── _components/
    │   ├── NteReturnClient.tsx
    │   └── NteReturnForm.tsx
    └── page.tsx
```

### 5.2 UI 1: TAG — Filter & Kolom

**Filters:**
- Search by Serial Number (text input)
- Filter asal (dropdown search address)
- Filter tujuan (dropdown search address)
- Filter item_description (dropdown, berdasarkan prefix SN)
- Filter periode transaksi (date range)

**Kolom Tabel:**
- id_transaksi
- type_transaksi (badge)
- asal
- tujuan
- SN count
- created_at
- created_by
- action (detail)

**Actions:**
- Button "Create Tag" → modal CreateTagModal
- Button detail per row → NteTagDetailModal (list SN + history)

### 5.3 UI 2: Set Install — Form

- WO Number (text input, required)
- No. Inet / Customer (text input, required)
- SN Input (text area, manual per baris — atau button "Mass Upload .txt")
- Preview SN list sebelum submit
- Submit → SP installation

### 5.4 UI 3: Return NTE — Form

- NIK Teknisi (dropdown search, dari hr.technicians)
- Tujuan Warehouse (dropdown search address)
- SN Input (text area, manual — atau button "Mass Upload .txt")
- Preview SN list sebelum submit
- Submit → SP return

### 5.5 Menu Edit/Delete SN — Non-Staff Only

Menu terpisah di sidebar atau sub-menu, **hanya visible untuk non-staff (Admin/Supervisor)**:

| Fitur | Keterangan |
|---|---|
| Edit SN | Ubah `item_description`, `condition_status` |
| Delete SN | Soft delete / deactivate SN |

---

## 6. Authorization

> Mengikuti MTMS §1.1 AGENTS.md. Setiap server action wajib memanggil `getSessionUser()` / `getSessionNik()`.

| Peran | Scope |
|---|---|
| **Staff** (PIC Gudang) | Hanya bisa create tag untuk SN yang `address` berada di warehouse yang PIC-nya |
| **Non-Staff** (Admin/Supervisor) | Semua warehouse + address eksternal/vendor + menu Edit/Delete SN |

**Address eksternal/vendor** — hanya non-staff yang bisa membuat transaksi ber-asal/tujuan ke address ini:
- `ta_witel_ccan_sby_utara`
- `tif_district_lamongan_wh`
- `ta_witel_inv_sby_utara`

---

## 7. Stored Procedures (Wajib)

Sesuai MTMS §1.2 AGENTS.md, seluruh transaksi NTE wajib via stored procedure di schema `nte_inventory`.

### 7.1 SP yang diperlukan

| SP Name | Fungsi |
|---|---|
| `nte_inventory.sp_create_tag_nte` | Buat tag transaksi stock_transfer / send_to_technician |
| `nte_inventory.sp_set_install_nte` | Proses installation (update status + wo_number + inet_number) |
| `nte_inventory.sp_return_nte` | Proses return from technician |
| `nte_inventory.sp_validate_sn_scope` | Validasi SN ada di scope user (staff PIC check) |

### 7.2 Contract `sp_create_tag_nte`

**Payload berubah berdasarkan subtype (§4.1):**

| Subtype | p_sn_list | Contoh |
|---------|-----------|--------|
| Inter-SO | `[{"serial_number":"..."}, ...]` | `string[]` (JSONB array of objects with `serial_number`) |
| Dari-SO | `[{"serial_number":"..."}, ...]` | `string[]` (JSONB array of objects with `serial_number`) |
| Ke-SO | `[{"serial_number":"...","item_description":"..."}, ...]` | perlu `item_description` untuk INSERT |

```sql
CREATE OR REPLACE PROCEDURE nte_inventory.sp_create_tag_nte(
 p_asal             VARCHAR,  -- address_name warehouse asal
 p_tujuan           VARCHAR,  -- address_name warehouse tujuan
 p_sn_list          JSONB,   -- [{serial_number, item_description?}, ...]
 p_created_by       VARCHAR,
 OUT p_id_trx       VARCHAR
)
LANGUAGE plpgsql
AS $$
DECLARE
 v_sn_record        RECORD;
 v_id_transaksi     VARCHAR;
 v_is_asal_so       BOOLEAN;
 v_is_tujuan_so     BOOLEAN;
 v_sn_text          VARCHAR;
 v_owner             VARCHAR;
BEGIN
 -- 1. Generate id_transaksi: WH-WH_{asal}-{tujuan}-{YYYYMMDDxxxxx}
 v_id_transaksi := 'WH-WH_' || p_asal || '_' || p_tujuan || '_' ||
   to_char(CURRENT_DATE, 'YYYYMMDD') ||
   lpad(nextval('nte_inventory.trx_nte_seq')::text, 5, '0');
 p_id_trx := v_id_transaksi;

 -- 2. Classify subtype based on address prefix (§4.1)
 -- SO: owner='telkom' AND (address LIKE 'ta_so_%' OR address = 'ta_witel_ccan_sby_utara')
 v_is_asal_so   := (SELECT
   addr.owner = 'telkom'
   AND (addr.address_name LIKE 'ta_so_%' OR addr.address_name = 'ta_witel_ccan_sby_utara')
 FROM nte_inventory.mas_address_nte addr WHERE addr.address_name = p_asal);
 v_is_tujuan_so := (SELECT
   addr.owner = 'telkom'
   AND (addr.address_name LIKE 'ta_so_%' OR addr.address_name = 'ta_witel_ccan_sby_utara')
 FROM nte_inventory.mas_address_nte addr WHERE addr.address_name = p_tujuan);

 -- 3. Process each SN
 FOR v_sn_record IN SELECT jsonb_array_elements(p_sn_list) AS item LOOP
   v_sn_text := v_sn_record.item->>'serial_number';

   IF v_is_asal_so AND v_is_tujuan_so THEN
     -- === Inter-SO: update address ===
     UPDATE nte_inventory.mas_sn_nte
     SET address = p_tujuan, updated_at = NOW()
     WHERE serial_number = v_sn_text
       AND inventory_status = 'available'
       AND condition_status != 'damage'
       AND address = p_asal
     RETURNING owner INTO v_owner;
     IF NOT FOUND THEN
       RAISE EXCEPTION 'SN "%" tidak ditemukan atau tidak valid di %', v_sn_text, p_asal;
     END IF;
     INSERT INTO nte_inventory.log_transaction_nte
       (id_transaksi, serial_number, type_transaksi, asal, tujuan, create_by)
     VALUES (v_id_transaksi, v_sn_text, 'stock_transfer', p_asal, p_tujuan, p_created_by);

   ELSIF v_is_asal_so AND NOT v_is_tujuan_so THEN
     -- === Dari-SO: log keluar, address tidak berubah ===
     IF NOT EXISTS (
       SELECT 1 FROM nte_inventory.mas_sn_nte
       WHERE serial_number = v_sn_text
         AND inventory_status = 'available'
         AND condition_status != 'damage'
         AND address = p_asal
     ) THEN
       RAISE EXCEPTION 'SN "%" tidak ditemukan atau tidak valid di %', v_sn_text, p_asal;
     END IF;
     INSERT INTO nte_inventory.log_transaction_nte
       (id_transaksi, serial_number, type_transaksi, asal, tujuan, create_by)
     VALUES (v_id_transaksi, v_sn_text, 'stock_transfer', p_asal, p_tujuan, p_created_by);

   ELSE
     -- === Ke-SO: INSERT new SN (no validation, no update existing) ===
     INSERT INTO nte_inventory.mas_sn_nte
       (serial_number, item_description, owner, address, inventory_status, condition_status)
     VALUES (
       v_sn_text,
       v_sn_record.item->>'item_description',
       (SELECT owner FROM nte_inventory.mas_address_nte WHERE address_name = p_tujuan),
       p_tujuan,
       'available',
       'normal'
     )
     ON CONFLICT (serial_number) DO UPDATE SET
       address = p_tujuan,
       updated_at = NOW();
     INSERT INTO nte_inventory.log_transaction_nte
       (id_transaksi, serial_number, type_transaksi, asal, tujuan, create_by)
     VALUES (v_id_transaksi, v_sn_text, 'stock_transfer', p_asal, p_tujuan, p_created_by);
   END IF;
 END LOOP;

 RAISE NOTICE 'NTE tag transaction created: %', v_id_transaksi;
END;
$$;
```

**Catatan:**
- Ke-SO menggunakan `ON CONFLICT DO UPDATE` agar idempotent (SN yang sudah ada akan di-update address-nya).
- Inter-SO dan Dari-SO sama-sama menerima `string[]` (tanpa `item_description`) tapi Dari-SO tidak mengubah `address`.

-- 1. Generate id_transaksi: INS_{wo_number}-{YYYYMMDDxxxxx}
-- 2. Validate SN: inventory_status = 'unavailable'
-- 3. Lock rows FOR UPDATE
-- 4. Update mas_sn_nte:
--    inventory_status = 'installed',
--    wo_number = p_wo_number,
--    inet_number = p_inet_number
-- 5. Insert log_transaction_nte per SN
-- 6. Return p_id_trx
$$;
```

### 7.4 Contract `sp_return_nte`

```sql
CREATE OR REPLACE PROCEDURE nte_inventory.sp_return_nte(
  p_nik_teknisi      VARCHAR,
  p_tujuan           VARCHAR,      -- address_name warehouse tujuan
  p_sn_list          JSONB,
  p_created_by       VARCHAR,
  OUT p_id_trx       VARCHAR
)
LANGUAGE plpgsql
AS $$
-- 1. Generate id_transaksi: TECH-WH_{nik}-{tujuan}-{YYYYMMDDxxxxx}
-- 2. Validate SN: inventory_status = 'unavailable', address = p_nik_teknisi
-- 3. Lock rows FOR UPDATE
-- 4. Update mas_sn_nte:
--    address = p_tujuan,
--    inventory_status = 'available',
--    wo_number = NULL,
--    inet_number = NULL
-- 5. Insert log_transaction_nte per SN
-- 6. Return p_id_trx
$$;
```

---

## 8. Repository

Sesuai MTMS §1.3 AGENTS.md, akses data via `src/lib/repositories/nte.repository.ts`.

| Method | Keterangan |
|---|---|
| `createTagNte(params)` | Wrap `sp_create_tag_nte` |
| `setInstallNte(params)` | Wrap `sp_set_install_nte` |
| `returnNte(params)` | Wrap `sp_return_nte` |
| `listNteTag(filters)` | List tag transactions dengan filter SN, periode, asal, tujuan, item |
| `getNteTagDetail(idTransaksi)` | Detail tag: list SN + log history per SN |
| `getSnHistory(serialNumber)` | Log transaksi per SN |
| `listAddresses(owner?)` | List master address (dropdown, searchable) |
| `listItems()` | List master item model |
| `updateSn(serialNumber, updates)` | Edit SN (non-staff only) — wrap `UPDATE mas_sn_nte` |
| `deleteSn(serialNumber)` | Soft delete SN (non-staff only) |

---

## 9. Idempotency

Transaksi write (create tag, set install, return) wajib menggunakan `checkAndStoreIdempotency` dengan `idemKey = p_id_trx`.

---

## 10. Tanggal

> Tidak menggunakan `formatted_date` — NTE tidak terkait WO Lensa.

Tanggal transaksi menggunakan `create_at` (timestamptz) dari `log_transaction_nte`.

---

## 11. Migration Plan

| # | File | Keterangan |
|---|---|---|
| 026 | `026_create_nte_inventory_schema.sql` | CREATE SCHEMA, CREATE TABLE (4 tabel), CREATE SEQUENCE, INSERT address master |
| 027 | `027_create_nte_stored_procedures.sql` | SP: create_tag, set_install, return, validate_sn_scope |
| 028 | `028_grant_nte_permissions.sql` | GRANT permission ke aplikasi |

### Detail Tabel `nte_inventory.mas_sn_nte`

```sql
CREATE TABLE nte_inventory.mas_sn_nte (
  id                  BIGSERIAL PRIMARY KEY,
  serial_number       VARCHAR(100) UNIQUE NOT NULL,
  item_description    VARCHAR(100) REFERENCES nte_inventory.mas_item_nte(...),
  owner               VARCHAR(20) NOT NULL,  -- telkom/tif/tsel
  address             VARCHAR(50) REFERENCES nte_inventory.mas_address_nte(address_name),
  inventory_status    VARCHAR(20) DEFAULT 'available',
  condition_status    VARCHAR(20) DEFAULT 'normal',
  wo_number           VARCHAR(50),
  inet_number         VARCHAR(50),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### Detail Tabel `nte_inventory.log_transaction_nte`

```sql
CREATE TABLE nte_inventory.log_transaction_nte (
  id                  BIGSERIAL PRIMARY KEY,
  id_transaksi        VARCHAR(100) NOT NULL,
  serial_number       VARCHAR(100) NOT NULL,
  type_transaksi      VARCHAR(30) NOT NULL,
  asal                VARCHAR(50),
  tujuan              VARCHAR(50),
  create_at           TIMESTAMPTZ DEFAULT NOW(),
  create_by           VARCHAR(50)
);
```

---

## 12. Roadmap

| Priority | Item |
|---|---|
| P1 | Schema + SP + Repository |
| P1 | UI TAG (tabel + create tag + mass upload) |
| P1 | UI Set Install (form + mass upload) |
| P1 | UI Return NTE (form + mass upload) |
| P2 | Menu Edit/Delete SN (non-staff only) |
| P2 | RBAC scoping (staff vs non-staff) |
| P2 | Detail tag (SN list + history per SN) |
| P3 | Dashboard NTE (stock overview per address/item) |
| P3 | Integrasi external vendor API |

---

> Dokumen ini adalah referensi utama proses bisnis NTE. Setiap perubahan harus tercermin di sini sebelum implementasi.
