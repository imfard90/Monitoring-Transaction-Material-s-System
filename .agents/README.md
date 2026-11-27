# Sistem Agen MTMS (.agents)

> Pusat konfigurasi, kepatuhan, metodologi, dan persona otonom untuk agen kecerdasan buatan (AI) dan pengembang pada repositori **Monitoring Transaction Material's System (MTMS)**.

Repositori ini menerapkan arsitektur *Agentic Engineering* terstruktur untuk memastikan setiap baris kode yang dihasilkan memenuhi standar keamanan tinggi, invarian bisnis PostgreSQL yang ketat, dan performa optimal.

---

## 1. Arsitektur 4 Lapisan (.agents)

Sistem agen MTMS dibangun di atas 4 lapisan yang saling melengkapi:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   SUMBER KEBENARAN TERTINGGI: AGENTS.md                │
│   (Prinsip Mutlak P0: Otorisasi Sesi, Invarian DB di SP, Migrasi Aman) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  1. RULES (.agents/rules/*.md)                                         │
│     Standar rekayasa umum, kriteria kelolosan, checklist keamanan,    │
│     dan matriks tingkat keparahan (Severity Levels).                   │
├────────────────────────────────────────────────────────────────────────┤
│  2. SKILLS (.agents/skills/**/SKILL.md)                                │
│     Koleksi 59 panduan "How-To", metodologi praktis, dan pola desain   │
│     untuk menyelesaikan tugas-tugas spesifik.                           │
├────────────────────────────────────────────────────────────────────────┤
│  3. AGENTS (.agents/agents/*.md)                                       │
│     29 persona spesialis dengan peran, tools/MCP, dan batas tugas      │
│     yang jelas (Reviewer, Architect, Resolver, Tester).                │
├────────────────────────────────────────────────────────────────────────┤
│  4. WORKFLOWS (.agents/workflows/ & .cline/workflows/)                 │
│     Alur kerja terstruktur yang menentukan urutan perintah dan langkah  │
│     operasional dari awal hingga selesai (DoD).                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Navigasi Direktori

| Direktori / File | Isi & Fungsi | Tautan Dokumentasi |
|---|---|:---:|
| **[`AGENTS.md`](../AGENTS.md)** | **Aturan wajib repositori MTMS**: Otorisasi Server Action (§1.1), Business Rules di Database (§1.2), Akses via Repository (§1.3), Google Sheets API (§1.5), External REST API Key (§1.6), Local Icon Bundle (§1.8). | [Baca `AGENTS.md`](../AGENTS.md) |
| **`skills/`** | **59 Panduan Metodologi Teknis**: Mencakup UI/UX (`ui-ux-pro-max`), TanStack Table v9 (`table-state`), database (`postgres-patterns`), pengujian (`tdd-workflow`), hingga domain MTMS (`better-auth`, `google-sheets`). | [Baca `skills/README.md`](skills/README.md) |
| **`agents/`** | **29 Persona Spesialis**: Arsitek sistem, peninjau kode (TypeScript, React, Database, Security), perbaikan build error, hingga penguji E2E. | [Baca `agents/README.md`](agents/README.md) |
| **`rules/`** | **Aturan Rekayasa Bersama**: Standar umum clean code, penanganan error, pelacakan sesi, dan kebijakan evaluasi kode. | [Lihat Direktori `rules/`](rules/) |
| **`workflows/`** | **Prosedur Eksekusi**: Alur kerja langkah-demi-langkah untuk tugas rutin seperti audit, review, pembuatan fitur, dan rilis. | [Lihat Direktori `workflows/`](workflows/) |

---

## 3. Alur Kerja Wajib Sebelum Menyelesaikan Tugas

Setiap agen yang bekerja di repo MTMS **wajib** mematuhi tahapan berikut:

1. **Pahami Kebijakan Inti:** Baca `AGENTS.md` sebelum menyentuh kode.
2. **Pilih Persona & Skill yang Relevan:** Gunakan panduan di `skills/` yang sesuai dengan domain tugas (misal: `postgres-patterns` untuk modifikasi SQL).
3. **Validasi & Integritas:**
   - Semua input divalidasi dengan Zod schema.
   - Operasi inventori kritis wajib lewat Stored Procedure (`inventory.sp_*`) via repository.
   - Otorisasi sesi diverifikasi di awal server action.
4. **Verifikasi Kualitas:**
   - Lolos uji tipe data (`npx tsc --noEmit`).
   - Lolos uji linter (`npx biome lint .`).
   - Lolos pengujian otomatis (`pnpm test:run`).
   - Pastikan icon dibundle lokal (`pnpm icons:bundle` & `tests/unit/bundled-icons.test.ts`).
