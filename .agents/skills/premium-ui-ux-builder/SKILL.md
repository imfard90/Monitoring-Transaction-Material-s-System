---
name: premium-ui-ux-builder
description: Spesialis UI/UX builder premium untuk MTMS. Aktif saat membuat/memperbaiki antarmuka (halaman, komponen, layout, form, tabel, chart), menilai kualitas UX, menerapkan sistem desain, dan mempolish tampilan. Fokus React + Next.js App Router + Tailwind CSS 4 + Radix UI + TanStack + ApexCharts + Framer Motion.
---

# Premium UI/UX Builder — MTMS

> Skill ini mengikat semua agen (manusia/AI) saat menyentuh UI/UX MTMS. Berlaku bersama `AGENTS.md`; bila terjadi konflik, `AGENTS.md` (keamanan, otorisasi, business rules) lebih tinggi.

## 0. Kapan aktif

Aktif saat tugas menyentuh salah satu:

- Membuat/memperbaiki halaman atau rute di `src/app/**`.
- Membuat/memperbaiki komponen di `src/components/ui/*` atau `src/app/<feature>/_components/*`.
- Mengubah layout, sidebar, header, container, atau tema CSS.
- Membangun/memperbaiki form, tabel data (TanStack Table), chart (ApexCharts), navigasi, dialog/drawer, feedback (toast/empty/loading/error).
- Menilai/memperbaiki UX (alur, mikrointeraksi, aksesibilitas, responsivitas, dark mode).
- Menerapkan brand/visual premium (tipografi, warna, spacing, elevasi, motion).

Tidak menggantikan otorisasi server action (§1.1 `AGENTS.md`) dan kontrak database (§1.2–1.4 `AGENTS.md`).

## 1. Sumber kebenaran UI

- **Primitif UI:** `src/components/ui/*` (berbasis Radix + CVA). Wajib reuse, jangan bikin primitif baru sebelum mengecek yang ada.
- **Tema & token:** `src/app/css/globals.css` (`@theme`, `@theme inline`), `src/app/css/app.css`, `src/app/css/layouts/*`, `src/app/css/override/reboot.css`.
- **Layout app:** `src/app/(DashboardLayout)/layout/**` (header, sidebar, shared).
- **Utils:** `cn` di `src/lib/utils` untuk merge kelas.
- **Stack:** Next.js App Router, React, TypeScript strict, Tailwind CSS 4, Radix UI, TanStack Query/Table, react-hook-form + Zod, Framer Motion, ApexCharts, next-themes.
## 2. Prinsip premium (wajib)

### 2.1 Konsistensi sistem desain
- Pakai token tema (`--color-primary`, `--radius-*`, `--shadow-*`, `--color-muted`, dll.) lewat kelas Tailwind, jangan hardcode nilai literal.
- Variasi komponen lewat CVA (`buttonVariants`); warna via token: `primary/secondary/success/warning/info/error` + `light*`.
- Satu sumber primitif: hanya `src/components/ui/*`. Komponen domain di `src/app/<feature>/_components/*` menyusun primitif, bukan meniru.

### 2.2 Hierarki & spacing
- Gunakan grid/spacing token: `gap-30`, `padding-15/30`, `margin-30`.
- Container konsisten via `src/app/css/layouts/container.css`.
- Satu fokus visual utama per tampilan; sekunder diredam dengan `text-muted-foreground`/`bg-muted`.
- Density tinggi untuk tabel dashboard, density lapang untuk form/detail.

### 2.3 Tipografi & warna
- Pakai skala font Tailwind yang konsisten; jangan campur unit ad-hoc.
- Warna semantik untuk status: `success`/`warning`/`info`/`error`/`destructive`.
- Kontras WCAG AA minimum (AA besar untuk teks besar, usahakan AAA untuk teks kecil).
- Dark mode wajib lolos: gunakan `dark:` variant via `@custom-variant dark`.

### 2.4 Motion & feedback
- Gunakan `framer-motion`/`tw-animate-css` untuk transisi yang halus dan berorientasi (enter/exit, shared element).
- Hormati `prefers-reduced-motion`: sediakan fallback non-motion.
- Feedback eksplisit untuk setiap aksi: loading (skeleton/spinner), success/error (toast/banner), pending state tombol.
- Mikrointeraksi lewat `button.tsx`: `active:scale-[0.98]`, `focus-visible:ring`, `transition-all duration-200`.

### 2.5 Aksesibilitas (a11y) — non-negotiable
- Komponen interaktif wajib keyboard-friendly dan punya `focus-visible` yang terlihat.
- Kontrol interaktif berbasis Radix sudah banyak a11y; pertahankan props a11y (`aria-*`, `role`, `label`).
- Semua gambar/info visual punya teks alternatif; ikon dekoratif `aria-hidden`.
- Jangan andalkan warna saja untuk status; sertakan ikon/teks.
- Form: `label` terhubung, pesan error jelas, `aria-invalid`, focus ke error pertama saat submit gagal.
## 3. Pola implementasi MTMS

### 3.1 Komponen domain
- Letak: `src/app/<feature>/_components/*.tsx`.
- Komposisi primitif `src/components/ui/*`; state lokal minimal, angkat ke server action/TanStack Query untuk data.
- Props bersifat domain, bukan mewarisi semua props Radix mentah.

### 3.2 Form
- `react-hook-form` + `@hookform/resolvers/zod` + schema Zod (sama dengan schema server action §2 langkah 5 `AGENTS.md`).
- Validasi client + server (jangan percaya client saja).
- Layout label-input-error konsisten; grup field dengan `gap-*` token.
- Tombol submit menampilkan loading + disabled saat pending; bukan hanya menghilangkan tombol.

### 3.3 Tabel data (TanStack Table)
- Kolom: header sortable/dapat filter bila masuk akal; alignment numerik kanan; tanggal terformat konsisten.
- Loading: skeleton baris; empty: ilustrasi/teks + aksi; error: state error dengan retry.
- Pagination/kolom banyak: virtualisasi atau `LIMIT/OFFSET` server-side (selaras §3.3 `AGENTS.md` — paginasi server-side).
- Aksi baris via dropdown menu Radix; konfirmasi destruktif via dialog/drawer.

### 3.4 Chart (ApexCharts)
- Gunakan token warna chart (`--chart-1`..`--chart-5`) dan `--color-*`.
- Responsif (`width: '100%'`), `maintainAspectRatio` sesuai konteks, dark mode disesuaikan.
- Sertakan tooltip, legend, dan label yang jelas; hindari gradient berlebihan.

### 3.5 Dialog/Drawer/Sheet
- Preferensi `dialog` untuk konfirmasi, `drawer`/`sheet` untuk form/detail samping.
- Fokus trap otomatis dari Radix; pastikan focus restore ke pemicu saat tutup.
- Overlay bisa ditutup via ESC/ klik luar hanya untuk aksi non-destruktif; destruktif wajib tombol eksplisit.

### 3.6 Navigasi & layout
- Sidebar/header lewat `src/app/(DashboardLayout)/layout/**` dan `tailwind-sidebar`.
- Indikator aktif jelas; breadcrumb untuk hierarki dalam; tetap sederhana untuk peran Staff.
## 4. Checklist penyelesaian UI

Sebelum menyatakan tugas UI selesai, pastikan:

- [ ] Reuse primitif `src/components/ui/*`, tidak ada duplikasi primitif baru.
- [ ] Pakai token tema (`--color-*`, `--radius-*`, `--shadow-*`), tidak ada nilai ad-hoc.
- [ ] Responsif minimal di breakpoint sm/md/lg; tidak ada overflow horizontal.
- [ ] Dark mode lolos; tidak ada warna hardcode yang patah di dark.
- [ ] Aksesibilitas: keyboard, `focus-visible`, label, kontras AA.
- [ ] Motion halus dan menghormati `prefers-reduced-motion`.
- [ ] Semua state lengkap: default, loading (skeleton), empty, error, success.
- [ ] Pesan pengguna dalam Bahasa Indonesia, sopan, spesifik.
- [ ] Tidak ada data sensitif (token/password) ter-render di UI; tetap redact (selaras §2 langkah 8 `AGENTS.md`).
- [ ] Tidak ada `console.*`/`alert` sebagai UI; gunakan mekanisme feedback global.
- [ ] `tsc` + `biome check .` lolos.
- [ ] Otorisasi tampilan tetap di server action (§1.1 `AGENTS.md`); UI hanya menyembunyikan, bukan satu-satunya penghalang.

## 5. Proses kerja UX (disiplin)

1. **Pahami konteks & peran** — siapa pengguna (Staff/Admin/Supervisor), tugas utama, perangkat dominan.
2. **Definisikan alur** — langkah demi langkah, titik keputusan, kondisi error.
3. **Sketsa struktur** — kerangka komponen (layout → container → card → table/form → item).
4. **Pilih primitif** — petakan ke `src/components/ui/*`; identifikasi kebutuhan baru (justifikasi).
5. **Implementasi** — susun komponen domain, bind form ke Zod + server action, sambungkan loading/error/empty.
6. **Verifikasi** — checklist §4; periksa visual di light/dark, sm/md/lg, dengan keyboard.
7. **Penyempurnaan** — tipografi, spacing, elevasi, motion, dan konsistensi visual premium.
8. **Dokumentasi** — catat keputusan desain penting di commit/PR; sebut alasan trade-off.

## 6. Batasan & etika skill

- Tidak meng-override `AGENTS.md` pada area otorisasi, mutasi stok, atau migrasi.
- Tidak menambah dependency UI baru tanpa justifikasi kuat; preferensi stack yang ada.
- Aksesibilitas dan keamanan tidak ditukar demi estetika.
- Inspirasi pola skill diadaptasi (lisensi masing-masing berlaku); implementasi ditulis ulang spesifik untuk MTMS.

## 7. Referensi adaptasi (inspirasi pola)

Adaptasi pola/format dari sumber tepercaya (periksa lisensi sebelum menyalin literal):

- Anthropic `skills` — pola `SKILL.md` + frontmatter, struktur direktori `.agents/skills/<name>/`.
- Vercel `agent-skills` — praktik terbaik React/Next.js performa, pola komposisi komponen.
- UI UX Pro Max — disiplin proses desain, checklist kualitas UI, pola design system.


### 3.7 Feedback global
- Satu mekanisme toast/banner konsisten; tidak boleh `alert()`/`console.error` sebagai UI.
- Pesan pengguna dalam Bahasa Indonesia yang sopan dan konkret (sebut entitas: header id, material, tanggal).


