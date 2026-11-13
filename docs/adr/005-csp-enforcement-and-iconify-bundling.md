# ADR-005: CSP Enforcement dan Strategi Penanganan Iconify API

- **Status**: Implemented (Phase 2 Completed)
- **Tanggal**: 2026-11-13
- **Pengusul**: Security Hardening Team & AI Agent
- **Komponen Terdampak**: `src/proxy.ts`, `@iconify/react`, `src/lib/icons/*`, `scripts/bundle-icons.mjs`, UI Components (`solar:*`, `lucide:*`, `mdi:*`, `ri:*`), Network Policy

---

## 1. Konteks (Context)

Dalam rangka memperketat postur keamanan MTMS terhadap serangan Cross-Site Scripting (XSS), data exfiltration, dan clickjacking, Content Security Policy (CSP) mode Enforce diaktifkan pada `src/proxy.ts`.

Setelah pengaktifan CSP Enforce, ditemukan bahwa icon di seluruh antarmuka dashboard (seperti header, sidebar, dan panel analitik) tidak muncul di lingkungan produksi. Console browser mencatat pesan pelanggaran:
```text
Connecting to https://api.iconify.design/solar.json violates the following Content Security Policy directive: "connect-src 'self' https://challenges.cloudflare.com"
Fetch API cannot load https://api.iconify.design/solar.json. Refused to connect.
```

### Investigasi Teknis:
1. Pustaka antarmuka MTMS menggunakan `@iconify/react` dengan icon set `solar:*`, `lucide:*`, `mdi:*`, dan `ri:*`.
2. Secara default, `@iconify/react` mengunduh data definisi SVG icon secara asynchronous pada saat runtime dari API publik (`https://api.iconify.design`, dll.).
3. Karena `connect-src` pada CSP sebelumnya hanya mengizinkan `'self'` dan Cloudflare Turnstile (`https://challenges.cloudflare.com`), browser memblokir panggilan fetch tersebut.
4. Terbukti pemblokiran terjadi di level CSP browser klien, bukan oleh Coraza WAF atau Caddy reverse proxy.

---

## 2. Keputusan (Decision)

Kami telah menerapkan solusi arsitektur jangka panjang (Phase 2: Local Icon Bundling):

### Fase 1: Immediate Remediation (Allowlist Sementara)
Sempat mengizinkan domain API eksternal pada `connect-src` sebagai transisi singkat.

### Fase 2: Long-Term Architectural Solution — SELESAI DITERAPKAN (Implemented)
1. **Pindaian & Ekstraksi Icon Otomatis (`scripts/bundle-icons.mjs`)**:
   - Memindai seluruh berkas kode sumber di `src/` untuk mendeteksi semua key icon yang digunakan (`solar:*`, `lucide:*`, `mdi:*`, `ri:*`).
   - Ditemukan tepat **130 icon unik** yang digunakan di MTMS (93 `solar`, 32 `lucide`, 6 `mdi`, 1 `ri`).
   - Mengambil definisi SVG hanya untuk 130 icon tersebut dan mengemasnya ke dalam berkas statis `src/lib/icons/bundled-icons.json` (ukuran hanya ~104 KB uncompressed, ~15 KB gzipped, jauh lebih hemat dibanding menginstal paket utuh `@iconify-json/solar` sebesar 12.6 MB).
2. **Registrasi Memori Otomatis (`src/lib/icons/register-icons.ts`)**:
   - Menggunakan `addCollection()` dari `@iconify/react` untuk mendaftarkan icon ke storage in-memory saat inisialisasi aplikasi di `src/app/providers.tsx`.
   - Komponen `<Icon />` merender SVG secara instan dan sinkron langsung dari memori tanpa HTTP fetch sama sekali.
3. **Penyempitan Ketat CSP `connect-src`**:
   - Mengembalikan `connect-src` pada `src/proxy.ts` ke mode paling ketat:
     ```text
     connect-src 'self' https://challenges.cloudflare.com;
     ```
   - Seluruh domain eksternal Iconify (`api.iconify.design`, `api.simplesvg.com`, `api.unisvg.com`) telah **dihapus sepenuhnya** dari allowlist CSP.

---

## 3. Konsekuensi (Consequences)

### Positif
- **Zero Runtime External Fetch:** Tidak ada lagi permintaan jaringan keluar untuk merender icon; icon muncul seketika tanpa delay jaringan atau flickering.
- **Kebijakan CSP Maksimal:** `connect-src` tertutup rapat hanya untuk `'self'` dan Cloudflare Turnstile. Mencegah exfiltration data secara total.
- **Ukuran Bundle Optimal:** Hanya 130 icon yang diperlukan yang dibundle (~104 KB), menghemat memori dan bandwidth browser.
- **Perawatan Berkelanjutan:** Script `pnpm icons:bundle` dapat dijalankan kapan saja ketika pengembang menambahkan icon baru di masa mendatang.

### Kompromi / Trade-off
- Jika pengembang menambahkan nama icon baru di codebase yang belum ada di `bundled-icons.json`, developer cukup menjalankan `pnpm icons:bundle` untuk memperbarui bundle lokal.

---

## 4. Verifikasi dan Pengujian

- Automated tests:
  - `tests/unit/csp-nonce.test.ts`: Memvalidasi bahwa `connect-src` hanya berisi `'self'` & Turnstile, serta tidak lagi memuat `api.iconify.design`.
  - `tests/unit/bundled-icons.test.ts`: Memvalidasi registrasi in-memory 130 icon dan ketersediaan payload SVG tanpa network fetch.
- Type check: `npx tsc --noEmit` lulus tanpa error.
- Linting: `npx biome check .` lulus tanpa error.
- Production build: `pnpm build` sukses.

