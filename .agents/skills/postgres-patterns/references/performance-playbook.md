# MTMS PostgreSQL Performance Playbook & Case Studies

> Dokumen pendamping teknis untuk skill [`.agents/skills/postgres-patterns/SKILL.md`](../SKILL.md).  
> Berisi bedah kode nyata (*Before vs After*), studi kasus audit repositori MTMS, dan hasil uji benchmark empiris.

---

## Studi Kasus 1: Mengeliminasi 3x Eksekusi CTE pada Inout TAG

### Lokasi Kode Eksisting:
`src/app/(DashboardLayout)/apps/inout-tag/_actions/tag-queries.ts` (Line 192–345) dan `src/lib/repositories/inventory/hasil-rekon.ts` (Line 194–270).

### Masalah:
Variabel `baseCte` yang berat (menggabungkan 2 tabel besar dengan 6 `JOIN` dan `UNION ALL`) dieksekusi **3 kali terpisah** ke database dalam 1 kali render halaman:
1. `countsQuery`: Menghitung badge tab status.
2. `countQuery`: Menghitung total data filtered untuk pagination (`SELECT count(*) as total FROM combined`).
3. `dataQuery`: Mengambil 20 baris data (`SELECT * FROM combined LIMIT 20 OFFSET 0`).

### Refactoring Blueprint (Before vs After):

#### SEBELUM (2 Query Terpisah untuk Pagination):
```ts
// Query 1: Total Count
const countQuery = sql<{ total: string }>`
    ${baseCte}
    SELECT count(*) as total FROM combined
    ${filterWhere}
`;
const countRes = await countQuery.execute(db);
const total = Number(countRes.rows[0]?.total ?? 0);

// Query 2: Data Rows
const dataQuery = sql<InOutTagRow>`
    ${baseCte}
    SELECT * FROM combined
    ${filterWhere}
    ORDER BY request_time DESC
    LIMIT ${pageSize} OFFSET ${offset}
`;
const dataRes = await dataQuery.execute(db);
```

#### SESUDAH (1 Query Tunggal via Window Function):
```ts
// Cukup 1 kali eksekusi CTE!
const combinedQuery = sql<InOutTagRow & { total_count: string }>`
    ${baseCte}
    SELECT 
        *,
        COUNT(*) OVER()::text AS total_count
    FROM combined
    ${filterWhere}
    ORDER BY request_time DESC
    LIMIT ${pageSize} OFFSET ${offset}
`;

const res = await combinedQuery.execute(db);
const rows = res.rows;
const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
```
*Hasil:* Menghemat 50% roundtrip jaringan dan beban komputasi PostgreSQL untuk query list berpaginasi.

---

## Studi Kasus 2: Menghapus 32.000 Parameter Dinamis pada K-PRO Bulk Ingestion

### Lokasi Kode Eksisting:
`src/lib/repositories/kpro.repository.ts` (Line 191–221).

### Masalah:
Perulangan chunk 500 baris $\times$ 64 kolom menghasilkan **32.000 parameter dinamis** (`$1` s/d `$32000`). Setiap sisa baris chunk (misal 134 baris) menghasilkan SQL teks berbeda (8.576 parameter), membuat plan cache database tidak pernah bisa dipakai ulang.

### Refactoring Blueprint (Before vs After):

#### SEBELUM (Dynamic Parameter Interpolation):
```ts
for (const row of chunk) {
    const rowPlaceholders: string[] = [];
    for (const col of columns) {
        rowPlaceholders.push(`$${paramIdx++}`);
        values.push(row[col]);
    }
    valueRows.push(`(${rowPlaceholders.join(', ')}, NOW(), NOW())`);
}
const sql = `INSERT INTO public.data_kpro VALUES ${valueRows.join(',\n')} ...`;
await client.query(sql, values);
```

#### SESUDAH (Static UNNEST Query):
```ts
// Siapkan array per kolom (64 array)
const wonumArr = chunk.map(r => r.wonum);
const crmTypeArr = chunk.map(r => r.crmordertype);
const statusArr = chunk.map(r => r.status);
// ... kolom lainnya

const sql = `
    INSERT INTO public.data_kpro (
        wonum, crmordertype, status, created_at, updated_at
    )
    SELECT 
        u.wonum, u.crmordertype, u.status, NOW(), NOW()
    FROM UNNEST(
        $1::varchar[], 
        $2::varchar[], 
        $3::varchar[]
    ) AS u(wonum, crmordertype, status)
    ON CONFLICT (wonum) DO UPDATE SET
        crmordertype = EXCLUDED.crmordertype,
        status = EXCLUDED.status,
        updated_at = NOW();
`;

// Teks query 100% statis! Plan cache PostgreSQL digunakan selamanya
await client.query(sql, [wonumArr, crmTypeArr, statusArr]);
```

---

## Studi Kasus 3: Eliminasi Correlated Subquery pada Master Data

### Lokasi Kode Eksisting:
`src/lib/repositories/inventory/master-data.ts` (Line 199–214).

### Masalah:
Pengecekan riwayat mutasi barang dilakukan dengan correlated subquery `EXISTS (...)` di klausa `SELECT`. Jika ada 500 baris stok di gudang, database mengevaluasi subquery tersebut 500 kali ke tabel `inventory.stock_movement`.

### Refactoring Blueprint (Before vs After):

#### SEBELUM (Row-by-Row Subquery):
```ts
.select((eb) =>
    eb.exists(
        eb.selectFrom('inventory.stock_movement as sm')
            .whereRef('sm.warehouse_id', '=', 'sb.warehouse_id')
            .whereRef('sm.designator_id', '=', 'sb.designator_id')
            .where('sm.movement_type', 'in', ['material_used', 'sap_out', 'transfer_out'])
    ).as('hasOutMaterialHistory')
)
```

#### SESUDAH (Set-Based CTE + LEFT JOIN):
```ts
// Dikelompokkan sekali via Hash Aggregate di database:
const query = db
    .with('active_movements', (db) =>
        db
            .selectFrom('inventory.stock_movement')
            .select(['warehouse_id', 'designator_id'])
            .where('movement_type', 'in', ['material_used', 'sap_out', 'transfer_out'])
            .distinct()
    )
    .selectFrom('inventory.stock_balance as sb')
    .leftJoin('active_movements as am', (join) =>
        join
            .onRef('am.warehouse_id', '=', 'sb.warehouse_id')
            .onRef('am.designator_id', '=', 'sb.designator_id')
    )
    .select([
        'sb.warehouse_id',
        'sb.designator_id',
        sql<boolean>`(am.warehouse_id IS NOT NULL)`.as('hasOutMaterialHistory')
    ]);
```

---

## Hasil Uji Coba Empiris Nyata (Benchmark Testing MTMS)

Perbandingan performa antara metode **Non-ETL (In-Memory Processing)** dan **ELT (Staging Table + Stored Procedure Engine)** yang telah diuji di database MTMS:

| Metrik Pengujian | Ukuran Data | Non-ETL (Node.js Memory) | ELT (PostgreSQL Engine) | Keunggulan ELT |
|---|---|---|---|---|
| **Waktu Eksekusi (Speed)** | 500 baris | **895 ms** | **281 ms** | **3.19x lebih cepat** |
| | 1.000 baris | **1.829 ms** | **346 ms** | **5.29x lebih cepat** |
| | 2.500 baris | **3.749 ms** | **445 ms** | **8.42x lebih cepat** |
| **Throughput (Baris/Detik)** | 2.500 baris | ~667 rows/sec | **~5.617 rows/sec** | **8.4x lebih tinggi** |
| **Network Roundtrips** | 2.500 baris | **100 calls** | **3 calls** | **Hemat 97% panggilan jaringan** |
| **Beban CPU Node.js (V8)** | 2.500 baris | **75 ms** | **5 ms** | **CPU 15x lebih ringan** |
| **Audit Log Anomali Alias** | 2.500 baris | 0 (tertutup di JS) | **1 logged** (`unmapped_log`) | **Audit anomali otomatis di DB** |

> **Skrip Benchmark:** Tersimpan dan dapat diaudit di `scratch/benchmark_etl_vs_non_etl.ts`.
