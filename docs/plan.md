# Rencana API MTMS

## Tujuan

Membuat API untuk mengambil informasi saldo stok dari MTMS. Dokumen ini mencatat keputusan kebutuhan yang sudah diklarifikasi sebagai dasar implementasi.

## Endpoint

- **Method:** `GET`
- **Path:** `/api/v1/stock`
- **Contoh URL:** `https://mtms-app.xxxxx.xxx.xx/api/v1/stock`
- **Format:** JSON
- **Autentikasi:** Bearer token menggunakan API key.
- **Data:** stock balance, yaitu branch, warehouse, material code/designator, dan `qty_stock`.
- **Cache:** nonaktif secara default untuk response privat.

## API key

- Format API key: `mtms_live_<random-secret>`.
- API key mentah hanya ditampilkan saat dibuat; database menyimpan hash SHA-256-nya pada kolom `auth.user.api_key`.
- Satu user hanya memiliki satu API key.
- User mengelola API key melalui halaman profil dan dapat menghapus key kapan saja.
- Jika key sudah ada, user harus menghapusnya terlebih dahulu sebelum membuat key baru.
- User dapat membuat key tanpa melihat status `appr_api`. Namun, key baru tidak dapat digunakan sampai admin menyetujui API user tersebut.
- Jika user membuat key baru, sistem otomatis mengubah `appr_api` menjadi `false`. Admin harus mengaktifkannya kembali melalui Management User sebelum API dapat digunakan. Karena `appr_api` berada pada tingkat user, penonaktifan ini berlaku untuk semua request API user tersebut.
- Menghapus atau membuat ulang key tidak mereset rate limit, karena pembatasan melekat pada user pemilik API, bukan pada nilai key.

## Akses data gudang

- Untuk user Staff, hasil dibatasi ke gudang yang dipetakan ke user tersebut.
- Untuk user non-Staff, hasil mencakup semua gudang.

## Approval API

- Tambahkan kolom boolean `appr_api` pada `auth.user` untuk status persetujuan penggunaan API.
- Sediakan toggle status API di halaman Management User.
- Jika `appr_api` bernilai `false`, semua request API milik user tersebut ditolak dengan status HTTP `403`.
- API key tetap tersimpan ketika approval dinonaktifkan. Jika admin mengaktifkan kembali `appr_api`, key yang tersimpan dapat digunakan lagi.

## Rate limit

- Setiap user pemilik API hanya boleh melakukan **1 request dalam setiap periode 5 menit**.
- Batas diterapkan bersama untuk semua endpoint API milik user, bukan terpisah per endpoint atau per key.
- Rate limit harus atomik per user agar request bersamaan tidak dapat lolos bersamaan.
- Request dengan API key valid mengonsumsi jatah saat mencapai pemeriksaan rate limit, sebelum pemeriksaan approval dan pengambilan data. Karena itu, request yang kemudian ditolak dengan `403` tetap mengonsumsi jatah.
- Request yang melampaui batas mendapat HTTP `429 Too Many Requests`, header `Retry-After`, dan waktu percobaan berikutnya (`retryAt`) dalam body JSON.

## Kontrak response

- Response sukses menggunakan envelope dengan metadata: `{ "data": [...], "meta": { ... } }`.
- Response error mengikuti RFC 9457 Problem Details.
- Response `429` mengikuti format error tersebut dan menambahkan `retryAt` di body serta `Retry-After` di header.

## Konvensi dan arsitektur

- Gunakan JSON dan format response yang konsisten; gunakan library standar yang sudah tersedia di project bila sesuai.
- Susun implementasi secara modular, misalnya route/handler khusus stock (`route-stock`).
