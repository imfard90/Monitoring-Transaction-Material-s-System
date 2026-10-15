# Google Sheets: MCP development-only dan API aplikasi

## MCP lokal (read-only)

MCP lokal menyediakan konteks spreadsheet untuk development saja. Tool yang tersedia:

- `list_sheets`: menampilkan nama tab dan dimensinya.
- `read_sheet_range`: membaca range A1 dengan batas 250 baris dan 50.000 karakter hasil.

MCP terkunci ke spreadsheet MTMS dan hanya menggunakan scope `spreadsheets.readonly`. MCP tidak memiliki tool mutasi dan jangan dinaikkan scope-nya.

## Akses spreadsheet dari kode aplikasi (read/write)

`google-sheets-api.ts` memakai client resmi Google `googleapis` (dependency proyek) dan mendukung service-account JSON melalui `GoogleAuth` dengan `keyFile` dan `scopes`. Modul menyediakan fungsi server-side:

```ts
import { readSheetRange, updateSheetRange } from '@/lib/google_ecosystem/google-sheets-api';

const current = await readSheetRange("'DATA HARI INI'!A1:B2");
await updateSheetRange({
  range: "'DATA HARI INI'!A1:B2",
  values: [['Kode', 'Qty'], ['MAT-001', 3]],
  valueInputOption: 'RAW',
});
```

Fungsi write menggunakan scope `https://www.googleapis.com/auth/spreadsheets`, `PUT` Values API, dan membatasi request hingga 250 baris. Opsi input adalah `USER_ENTERED` (default) atau `RAW`. Range harus menyebut nama sheet dan batas cell eksplisit.

Write dilakukan langsung pada range yang disebutkan—tidak ada rollback/transaksi lintas range. Gunakan hanya di kode server tepercaya; jangan panggil dari browser/client atau endpoint publik tanpa autentikasi, otorisasi, dan validasi domain yang sesuai. Google Sheets API akan menolak penulisan jika akun service hanya diberi Viewer.

## Prasyarat

1. Aktifkan Google Sheets API.
2. Set `GOOGLE_APPLICATION_CREDENTIALS` di environment ke path JSON service account. Modul API mengharuskan env var disetel; path relatif dihitung dari working directory. Jangan commit credential.
3. Bagikan spreadsheet ke email service account dengan Viewer untuk MCP/read, atau Editor jika fungsi kode perlu menulis.

MCP memakai credential service account lokal yang sama bila dikonfigurasi demikian, tetapi meminta scope `spreadsheets.readonly` saja. Konfigurasi MCP berada di pengaturan Cline lokal; jangan commit file konfigurasi atau credential tersebut. Restart VS Code/Cline setelah mengubah konfigurasi. Pesan error tidak menampilkan isi credential maupun access token.

## Jalankan MCP

```bash
pnpm mcp:google-sheets
```

## Pengaturan Cline

Server `mtms-google-sheets` dipasang lokal dan tidak menggantikan server MCP lain. Jangan menambahkan tool write ke server development ini. MCP lokal dan file credential diabaikan oleh Git.
