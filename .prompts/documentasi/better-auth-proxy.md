# Better Auth di Next.js: Proxy dan Middleware

Dokumentasi ini merangkum cara kerja dan konfigurasi yang tepat untuk Better Auth saat dijalankan di belakang reverse proxy (seperti Nginx, Vercel, atau Cloudflare) dan saat digunakan di dalam Next.js Middleware.

## 1. Konfigurasi `trustedOrigins`
Better Auth tidak memiliki properti spesifik bernama `trustHost` seperti pada *Auth.js* (NextAuth). Sebagai gantinya, jika aplikasi berjalan di balik proxy dengan berbagai URL (misalnya dari IP lokal dan Domain HTTPS), Anda harus mendefinisikan `trustedOrigins`.

```typescript
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL, // Harus URL production utama (https://...)
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://domain-produksi-anda.com",
  ],
  // ...
});
```

## 2. Isu SSL (ERR_SSL_WRONG_VERSION_NUMBER) pada Middleware
Saat berjalan di Next.js Middleware (Edge Runtime), function `auth.api.getSession()` menggunakan metode `fetch` secara internal untuk menghubungi endpoint `/api/auth/session`.
Karena ia menggunakan `baseURL` yang berawalan `https://`, fetch ini memicu pencarian DNS dari dalam server itu sendiri.

Bila Nginx melakukan proxy dari HTTPS ke HTTP (port 8000), request dari dalam Node.js (`fetch`) seringkali keliru mengarah langsung ke port HTTP, tapi dengan protokol HTTPS. Hal ini akan menyebabkan Node.js *crash* dengan error:
`ERR_SSL_WRONG_VERSION_NUMBER`

### Solusi Terbaik untuk Middleware
Alih-alih memanggil `auth.api.getSession()` di middleware, lakukan fetch langsung menggunakan URL HTTP lokal (loopback address), sehingga request tersebut mem-bypass lapisan Nginx HTTPS, dan berkomunikasi langsung secara *plaintext* (HTTP) antara middleware dan server:

```typescript
// Di dalam middleware.ts
const port = process.env.PORT || 8000;
const baseUrl = process.env.NODE_ENV === 'production' 
    ? `http://127.0.0.1:${port}` 
    : request.nextUrl.origin;

const res = await fetch(`${baseUrl}/api/auth/get-session`, {
    headers: {
        cookie: request.headers.get('cookie') || '',
    },
});
const session = res.ok ? await res.json() : null;
```

## 3. Proxy Header Nginx
Agar Better Auth mengerti bahwa request awal datang dari HTTPS (meskipun Node.js menerimanya lewat HTTP), pastikan Nginx Anda memiliki *header* penerusan (forwarding) standar ini di blok `location /`:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
```
Header `X-Forwarded-Proto https` memberitahu Better Auth untuk me-render link callback OAuth dan cookie dengan format `Secure` yang benar.
