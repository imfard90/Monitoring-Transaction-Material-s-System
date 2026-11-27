# MTMS Agent Skills Directory

> Direktori resmi kumpulan **59 Agent Skills** yang digunakan oleh agen AI dan pengembang di repositori **Monitoring Transaction Material's System (MTMS)**.  
> Setiap skill berisi panduan implementasi mandiri di dalam folder masing-masing (`<skill-name>/SKILL.md`) dengan metadata YAML frontmatter (`name`, `description`).

Panduan dalam skill bersifat komplementer dan operasional. Sesuai ketentuan **`AGENTS.md` §0**, prinsip keamanan, aturan bisnis di database (`inventory.sp_*`), dan otorisasi server action di `AGENTS.md` tetap menjadi **sumber kebenaran tertinggi (P0)** yang tidak boleh dikesampingkan oleh skill generik.

---

## 1. Taksonomi & Indeks Kategori Skill (59 Skills)

| Kategori | Jumlah | Daftar Skill |
|---|:---:|---|
| **1. Engineering & SDLC** | 7 | [`codebase-design`](codebase-design/SKILL.md), [`debugging`](debugging/SKILL.md), [`domain-modeling`](domain-modeling/SKILL.md), [`research`](research/SKILL.md), [`tdd-workflow`](tdd-workflow/SKILL.md), [`two-axis-code-review`](two-axis-code-review/SKILL.md), [`writing-docs`](writing-docs/SKILL.md) |
| **2. Architecture & Design** | 7 | [`clean-architecture`](clean-architecture/SKILL.md), [`domain-driven-design`](domain-driven-design/SKILL.md), [`backend-patterns`](backend-patterns/SKILL.md), [`frontend-patterns`](frontend-patterns/SKILL.md), [`postgres-patterns`](postgres-patterns/SKILL.md), [`redis-patterns`](redis-patterns/SKILL.md), [`api-design`](api-design/SKILL.md) |
| **3. UI/UX & Design System** | 11 | [`ui-ux-pro-max`](ui-ux-pro-max/SKILL.md), [`design-system`](design-system/SKILL.md), [`ui-styling`](ui-styling/SKILL.md), [`frontend-a11y`](frontend-a11y/SKILL.md), [`accessibility`](accessibility/SKILL.md), [`make-interfaces-feel-better`](make-interfaces-feel-better/SKILL.md), [`motion-foundations`](motion-foundations/SKILL.md), [`motion-advanced`](motion-advanced/SKILL.md), [`motion-patterns`](motion-patterns/SKILL.md), [`frontend-design-direction`](frontend-design-direction/SKILL.md), [`design`](design/SKILL.md) |
| **4. Data Table (TanStack Table v9)** | 3 | [`getting-started`](getting-started/SKILL.md), [`migrate-v8-to-v9`](migrate-v8-to-v9/SKILL.md), [`table-state`](table-state/SKILL.md) |
| **5. Testing, QA & Security** | 6 | [`react-testing`](react-testing/SKILL.md), [`e2e-testing`](e2e-testing/SKILL.md), [`browser-qa`](browser-qa/SKILL.md), [`security-scan`](security-scan/SKILL.md), [`security-review`](security-review/SKILL.md), [`cybersecurity`](cybersecurity/SKILL.md) |
| **6. Code Quality & Refactoring** | 7 | [`clean-code`](clean-code/SKILL.md), [`code-complete`](code-complete/SKILL.md), [`coding-standards`](coding-standards/SKILL.md), [`refactoring`](refactoring/SKILL.md), [`refactoring-guru`](refactoring-guru/SKILL.md), [`error-handling`](error-handling/SKILL.md), [`working-effectively-with-legacy-code`](working-effectively-with-legacy-code/SKILL.md) |
| **7. MTMS Domain Spesifik** | 6 | [`better-auth`](better-auth/SKILL.md), [`google-sheets`](google-sheets/SKILL.md), [`mtms-security-guide`](mtms-security-guide/SKILL.md), [`mtms-create-page`](mtms-create-page/SKILL.md), [`mtms-change-branding`](mtms-change-branding/SKILL.md), [`nextjs-turbopack`](nextjs-turbopack/SKILL.md) |
| **8. Classical References** | 3 | [`a-philosophy-of-software-design`](a-philosophy-of-software-design/SKILL.md), [`designing-data-intensive-applications`](designing-data-intensive-applications/SKILL.md), [`the-pragmatic-programmer`](the-pragmatic-programmer/SKILL.md) |
| **9. Productivity & Alignment** | 4 | [`grill-me`](grill-me/SKILL.md), [`handoff`](handoff/SKILL.md), [`to-questionnaire`](to-questionnaire/SKILL.md), [`wait-what`](wait-what/SKILL.md) |
| **10. Process & Workflow** | 5 | [`skill-authoring`](skill-authoring/SKILL.md), [`git-workflow`](git-workflow/SKILL.md), [`database-migrations`](database-migrations/SKILL.md), [`react-performance`](react-performance/SKILL.md), [`cybersecurity`](cybersecurity/SKILL.md) |

---

## 2. Panduan Cepat Pemilihan Skill (Quick Router)

- **Menulis Fitur Baru / Perbaikan Bug:**
  Mulai dengan [`tdd-workflow`](tdd-workflow/SKILL.md) untuk siklus RED-GREEN-REFACTOR $\to$ konsultasikan [`coding-standards`](coding-standards/SKILL.md) $\to$ tinjau dengan [`two-axis-code-review`](two-axis-code-review/SKILL.md).
- **Membangun Komponen Antarmuka (UI):**
  Rujuk [`ui-ux-pro-max`](ui-ux-pro-max/SKILL.md) untuk pola desain, [`ui-styling`](ui-styling/SKILL.md) untuk integrasi Tailwind/shadcn, [`frontend-a11y`](frontend-a11y/SKILL.md) untuk aksesibilitas keyboard/ARIA, dan [`motion-patterns`](motion-patterns/SKILL.md) untuk animasi interaksi.
- **Implementasi / Migrasi Tabel Data:**
  Gunakan [`getting-started`](getting-started/SKILL.md) dan [`table-state`](table-state/SKILL.md) untuk adapter TanStack Table v9 dengan kontrol state reaktif.
- **Perubahan Database & Optimasi Performa Query:**
  Wajib merujuk [`postgres-patterns`](postgres-patterns/SKILL.md) untuk standar 5 Pilar (Prepared Statement, Indexing, Partitioning, Streaming COPY, Replikasi) dan pola CTE berkinerja tinggi, serta ikuti [`database-migrations`](database-migrations/SKILL.md) untuk migrasi idempoten terlacak. Pendamping kode dan studi kasus Before/After tersedia di [`postgres-patterns/references/performance-playbook.md`](postgres-patterns/references/performance-playbook.md).
- **Integrasi Ekosistem Google Sheets:**
  Wajib mengikuti [`google-sheets`](google-sheets/SKILL.md) (klien resmi `googleapis` server-only, batas range 250 baris, MCP strictly read-only).
- **Audit Keamanan & Otorisasi:**
  Gunakan [`security-review`](security-review/SKILL.md), [`mtms-security-guide`](mtms-security-guide/SKILL.md), dan [`better-auth`](better-auth/SKILL.md).

---

## 3. Pemisahan Layer Arsitektur MTMS

MTMS membagi tata kelola agen ke dalam 4 lapisan yang memiliki batas kepemilikan tegas:

```
[Layer 1: Entry Points]      .cline/workflows/*.md  (Urutan perintah operasional & CLI)
                                      │
[Layer 2: Methodology]       .agents/skills/**      (Panduan "How-To" dan metode teknis)
                                      │
[Layer 3: Standards & Gates] .agents/rules/*.md     (Standar kode, kriteria kelolosan, checklist)
                                      │
[Layer 4: Supreme Policy]    AGENTS.md              (Aturan Bisnis DB, Keamanan P0, Otorisasi Sesi)
```

| Layer | Cakupan Tugas | Yang DILARANG di Layer Ini |
|---|---|---|
| **Workflows** (`.cline/workflows/`) | Perintah berurutan, skrip eksekusi, instruksi langkah | Standar pengkodean, filosofi arsitektur |
| **Skills** (`.agents/skills/`) | Metodologi kerja, panduan *how-to*, pola solusi | Menetapkan kriteria kelulusan review / severity level |
| **Rules** (`.agents/rules/`) | Standar kualitas, matriks kepatuhan, batas toleransi | Menulis urutan langkah-langkah terminal interaktif |
| **Supreme Policy** (`AGENTS.md`) | Invarian bisnis mutlak, otorisasi sesi, migrasi | Digantikan atau diabaikan oleh skill mana pun |

---

## 4. Standar Pembuatan Skill Baru

Untuk menambah skill baru, ikuti disiplin [`skill-authoring/SKILL.md`](skill-authoring/SKILL.md):
1. **Satu skill per folder:** Terletak di `.agents/skills/<nama-skill>/SKILL.md`.
2. **Format Frontmatter Wajib:**
   ```yaml
   ---
   name: nama-kebab-case
   description: Selalu diawali dengan "Use when..." mencakup pemicu/gejala konkret.
   ---
   ```
3. **Maksimal ~500 baris per file:** Dokumentasi referensi panjang dipisahkan ke file pendamping (`references/`).
4. **Verifikasi TDD:** Uji efektivitas instruksi skill terhadap skenario nyata sebelum digabungkan ke repositori.
