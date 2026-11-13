# ADR-005: CSP Enforcement dan Strategi Penanganan Iconify API

- **Status**: Accepted
- **Tanggal**: 2026-11-13
- **Pengusul**: Security Hardening Team & AI Agent
- **Komponen Terdampak**: `src/proxy.ts`, `@iconify/react`, UI Components (`solar:*` icons), Network Policy

---

## 1. Konteks (Context)

Dalam rangka memperketat postur keamanan MTMS terhadap serangan Cross-Site Scripting (XSS), data exfiltration, dan clickjacking, Content Security Policy (CSP) mode Enforce diaktifkan pada `src/proxy.ts`.

Setelah pengaktifan CSP Enforce, ditemukan bahwa icon di seluruh antarmuka dashboard (seperti header, sidebar, dan panel analitik) tidak muncul di lingkungan produksi. Console browser mencatat pesan pelanggaran:
```text
Connecting to https://api.iconify.design/solar.json violates the following Content Security Policy directive: "connect-src 'self' https://challenges.cloudflare.com"
Fetch API cannot load https://api.iconify.design/solar.json. Refused to connect.
```

### Investigasi Teknis:
1. Pustaka antarmuka MTMS menggunakan `@iconify/react` dengan icon set `solar:*`.
2. Secara default, `@iconify/react` mengunduh data definisi SVG icon secara asynchronous pada saat runtime dari API publik:
   - Primary: `https://api.iconify.design`
   - Fallback Mirrors: `https://api.simplesvg.com`, `https://api.unisvg.com`
3. Karena `connect-src` pada CSP sebelumnya hanya mengizinkan `'self'` dan Cloudflare Turnstile (`https://challenges.cloudflare.com`), browser memblokir panggilan fetch tersebut.
4. Terbukti pemblokiran terjadi di level CSP browser klien, bukan oleh Coraza WAF atau Caddy reverse proxy.

---

## 2. Keputusan (Decision)

Kami mengadopsi pendekatan dua fase (Two-Phase Strategy):

### Fase 1: Immediate Remediation (Allowlist Resmi)
Memperbarui direktif `connect-src` pada `src/proxy.ts` untuk mengizinkan domain resmi Iconify API dan mirror resminya:
```text
connect-src 'self' https://challenges.cloudflare.com https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com;
```
Tindakan ini langsung memulihkan tampilan icon di production tanpa downtime dan tanpa merusak integrasi komponen yang ada.

### Fase 2: Long-Term Architectural Solution (Local Icon Bundling)
Menjadwalkan migrasi arsitektur icon agar tidak lagi bergantung pada API eksternal saat runtime:
1. **Local Icon Bundling**: Mengemas (*bundling*) ~90 icon Solar yang digunakan di MTMS ke dalam bundle aplikasi saat build-time menggunakan `@iconify/react` (`addCollection` / `addIcon`) atau `@iconify-json/solar`.
2. **Zero Runtime Fetch**: Saat browser merender `<Icon icon="solar:..." />`, icon data sudah tersedia di memori klien dan langsung dirender sebagai SVG inline tanpa HTTP fetch.
3. **Penyempitan CSP**: Setelah seluruh icon dibundle secara lokal, domain `api.iconify.design` akan dicabut kembali dari `connect-src`, mengembalikan kebijakan ke zero external connection untuk aset UI.

---

## 3. Konsekuensi (Consequences)

### Positif
- **Pemulihan Cepat:** Icon antarmuka langsung tampil normal di lingkungan production.
- **Transparansi Sumber Koneksi:** Allowlist dibatasi secara spesifik hanya pada domain resmi Iconify API yang sah.
- **Rencana Jangka Panjang Jelas:** Mengarah pada zero-latency icon rendering dan zero runtime external dependencies.
- **Keamanan CSP Terjaga:** Tetap tidak menggunakan `'unsafe-inline'` pada `script-src` dan tidak menonaktifkan CSP mode Enforce.

### Kompromi / Trade-off
- Pada Fase 1, browser diizinkan melakukan koneksi HTTP ke `api.iconify.design` untuk mengambil data icon JSON. Hal ini diterima sebagai solusi transisi operasional yang aman.

---

## 4. Alternatif yang Dipertimbangkan

- **Alternatif A: Menonaktifkan atau menurunkan CSP ke Report-Only**  
  *Ditolak.* Menurunkan kebijakan ke Report-Only membuka kembali celah kerentanan XSS dan script injection di production.
- **Alternatif B: Menghapus atau melonggarkan aturan Coraza WAF**  
  *Ditolak.* WAF tidak memblokir traffic ini; blokir terjadi sepenuhnya di browser oleh CSP `connect-src`.
- **Alternatif C: Memaksa migrasi manual 90 icon ke komponen SVG mentah sekaligus secara mendadak**  
  *Ditolak untuk Fase 1.* Berisiko tinggi menimbulkan regresi visual dan keterlambatan rilis. Pendekatan bertahap (Allowlist Fase 1 $\rightarrow$ Bundling Fase 2) jauh lebih stabil dan terkontrol.

