# MTMS Specialized Agent Personas

> Direktori resmi kumpulan **29 Specialized Agent Personas** yang terdaftar di repositori **Monitoring Transaction Material's System (MTMS)** (`.agents/agents/*.md`).  
> Setiap file agent mendefinisikan persona profesional, kapabilitas alat (tools/MCP), model acuan, baseline pertahanan prompt, serta prosedur review mandiri.

---

## 1. Indeks & Taksonomi Agen (29 Agents)

```
                     KUMPULAN PERSONA AGEN MTMS (29 AGENTS)
┌──────────────────────────────────────┬──────────────────────────────────────┐
│  Arsitektur & Desain                 │  Code Review & Keamanan              │
│  - architect                         │  - code-reviewer                     │
│  - code-architect                    │  - react-reviewer                    │
│  - code-explorer                     │  - typescript-reviewer               │
│                                      │  - database-reviewer                 │
├──────────────────────────────────────│  - security-reviewer                 │
│  Build & Perbaikan Error             │  - silent-failure-hunter             │
│  - build-error-resolver              │  - comment-analyzer                  │
│  - react-build-resolver              │  - type-design-analyzer              │
│  - performance-optimizer             ├──────────────────────────────────────┤
│  - refactor-cleaner                  │  Testing & Verifikasi                │
│  - code-simplifier                   │  - tdd-guide                         │
├──────────────────────────────────────│  - e2e-runner                        │
│  Dokumentasi & Spesifikasi           │  - pr-test-analyzer                  │
│  - doc-updater                       │  - agent-evaluator                   │
│  - docs-lookup                       ├──────────────────────────────────────┤
│  - spec-miner                        │  Aksesibilitas & UI                  │
├──────────────────────────────────────│  - a11y-architect                     │
│  Operasional & Workflow Meta         ├──────────────────────────────────────┤
│  - planner                           │  - loop-operator                     │
│  - chief-of-staff                    │  - conversation-analyzer             │
│  - harness-optimizer                 │                                      │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Rincian Peran & Kapan Menggunakan Setiap Agen

### A. Arsitektur & Perencanaan Sistem
| Nama Agen | Model | Kapan Harus Digunakan |
|---|:---:|---|
| **[`architect`](architect.md)** | `pro` | Merancang sistem baru, mengevaluasi *trade-offs*, memecahkan *bottleneck* skalabilitas, dan menjaga konsistensi arsitektur repositori. |
| **[`code-architect`](code-architect.md)** | `pro` | Menganalisis pola eksisting kode untuk menghasilkan cetak biru implementasi konkret (file, antarmuka, urutan *build*). |
| **[`code-explorer`](code-explorer.md)** | `flash` | Menelusuri alur eksekusi, memetakan lapisan arsitektur, dan memetakan dependensi fitur yang ada sebelum memulai fitur baru. |
| **[`planner`](planner.md)** | `pro` | Menyusun rencana bertahap untuk fitur kompleks atau refactoring besar sebelum perubahan kode dimulai. |

### B. Code Review, Keamanan & Integritas
| Nama Agen | Model | Kapan Harus Digunakan |
|---|:---:|---|
| **[`code-reviewer`](code-reviewer.md)** | `pro` | **Wajib dijalankan** untuk setiap perubahan kode; mengevaluasi kualitas, keamanan, pemisahan layer, dan kesesuaian standar. |
| **[`react-reviewer`](react-reviewer.md)** | `pro` | **Wajib dijalankan** untuk perubahan pada file `.tsx`/`.jsx` (hook correctness, server/client boundary, render performance). |
| **[`typescript-reviewer`](typescript-reviewer.md)** | `pro` | **Wajib dijalankan** untuk keamanan tipe data TypeScript, penanganan *null/undefined*, asinkronitas, dan keamanan runtime. |
| **[`database-reviewer`](database-reviewer.md)** | `pro` | **Wajib dijalankan** untuk perubahan SQL/migrasi, stored procedure, indeks, skema relasional, dan optimasi query. |
| **[`security-reviewer`](security-reviewer.md)** | `pro` | Review mendalam celah OWASP Top 10, sanitasi input pengguna, proteksi secret/kredensial, dan otorisasi server action. |
| **[`silent-failure-hunter`](silent-failure-hunter.md)** | `flash` | Memindai blok `try-catch` kosong, penelanan error diam-diam, fallback tidak aman, dan kurangnya propagasi error. |
| **[`comment-analyzer`](comment-analyzer.md)** | `flash_lite` | Menilai akurasi, kelengkapan, dan risiko kedaluwarsa (*comment rot*) pada komentar kode. |
| **[`type-design-analyzer`](type-design-analyzer.md)** | `flash` | Memeriksa enkapsulasi tipe data, ekspresi invarian, dan eliminasi tipe data ambigu (`any` / `unknown`). |

### C. Build, Perbaikan Error & Optimasi
| Nama Agen | Model | Kapan Harus Digunakan |
|---|:---:|---|
| **[`build-error-resolver`](build-error-resolver.md)** | `flash` | Mengatasi kegagalan build TypeScript/tsc dengan perubahan bedah minimal tanpa merombak arsitektur. |
| **[`react-build-resolver`](react-build-resolver.md)** | `pro` | Mendiagnosis dan memperbaiki kegagalan compile Next.js/Turbopack, hidrasi mismatch, dan server component boundary error. |
| **[`performance-optimizer`](performance-optimizer.md)** | `pro` | Menganalisis latensi query, kebocoran memori, optimasi re-render React, dan pengurangan bundle size JavaScript. |
| **[`refactor-cleaner`](refactor-cleaner.md)** | `flash` | Membersihkan dead-code, file tak terpakai, duplikasi modul, dan dependensi tidak aktif secara aman. |
| **[`code-simplifier`](code-simplifier.md)** | `flash` | Menyederhanakan kode yang terlalu rumit agar lebih mudah dibaca dan dipelihara tanpa mengubah perilakunya. |

### D. Testing & Kualitas Pengujian
| Nama Agen | Model | Kapan Harus Digunakan |
|---|:---:|---|
| **[`tdd-guide`](tdd-guide.md)** | `pro` | Memandu siklus Test-Driven Development (menulis unit/integration test terlebih dahulu sebelum implementasi). |
| **[`e2e-runner`](e2e-runner.md)** | `pro` | Mengelola, menjalankan, dan menstabilkan skenario pengujian End-to-End berbasis Playwright. |
| **[`pr-test-analyzer`](pr-test-analyzer.md)** | `flash` | Memeriksa kecukupan cakupan behavioral test pada pull request untuk mencegah lolosnya regresi bisnis. |
| **[`agent-evaluator`](agent-evaluator.md)** | `pro` | Menilai kualitas output agen lain berdasarkan 5 parameter (akurasi, kelengkapan, kejelasan, keterlaksanaan, keringkasan). |

### E. Aksesibilitas & UI/UX
| Nama Agen | Model | Kapan Harus Digunakan |
|---|:---:|---|
| **[`a11y-architect`](a11y-architect.md)** | `pro` | Memastikan seluruh komponen UI memenuhi standar kepatuhan WCAG 2.2 Level AA (kontras, navigasi keyboard, semantic ARIA). |

### F. Dokumentasi & Spesifikasi
| Nama Agen | Model | Kapan Harus Digunakan |
|---|:---:|---|
| **[`doc-updater`](doc-updater.md)** | `flash` | Memperbarui dokumentasi teknis, codemaps (`docs/CODEMAPS/*`), dan README setelah perubahan fitur. |
| **[`docs-lookup`](docs-lookup.md)** | `flash` | Mengambil dokumentasi resmi dan termutakhir menggunakan Context7 MCP saat membutuhkan referensi library/API. |
| **[`spec-miner`](spec-miner.md)** | `pro` | Mengekstraksi spesifikasi perilaku dan invarian bisnis dari kode yang sudah ada untuk OpenSpec. |

### G. Operasional & Meta-Workflow
| Nama Agen | Model | Kapan Harus Digunakan |
|---|:---:|---|
| **[`chief-of-staff`](chief-of-staff.md)** | `flash` | Mengelola komunikasi, triage notifikasi, dan ringkasan status lintas saluran. |
| **[`loop-operator`](loop-operator.md)** | `flash` | Memantau siklus loop agen otonom dan melakukan intervensi jika terjadi kebuntuan (*stall*). |
| **[`harness-optimizer`](harness-optimizer.md)** | `pro` | Mengoptimalkan konfigurasi agent-harness lokal, biaya token, dan keandalan pass-rate. |
| **[`conversation-analyzer`](conversation-analyzer.md)** | `flash` | Menganalisis transkrip percakapan untuk menemukan pola kegagalan yang layak dicegah dengan hooks. |

---

## 3. Protokol Pertahanan Prompt & Akses Aman (Baseline)

Semua agen di MTMS mematuhi standar pertahanan prompt seragam:
1. **Tidak Berganti Identitas:** Agen dilarang mengabaikan arahan dasar atau mengubah peran di luar batas tugasnya.
2. **Kerahasiaan Secret:** Kredensial, secret manager, JWT token, dan connection string tidak boleh dicetak ke log publik atau chat.
3. **Database Read-Only via MCP:** Agen membaca skema dan data database hanya melalui server MCP `postgres__query`. Mutasi data domain hanya boleh melalui Stored Procedure resmi dan migrasi terlacak.
