# Laporan Audit Keamanan AI Skills (SkillSpector Benchmark)

Dokumentasi audit keamanan independen untuk seluruh AI Agent Skills di repositori Monitoring Transaction Material's System (MTMS) menggunakan metodologi dan taksonomi ancaman **NVIDIA SkillSpector**.

---

## 1. Ringkasan Eksekutif

- **Target Audit**: Direktori `.agents/skills/` (57 skill, 182 file total, termasuk 27 skrip Python pendukung).
- **Standar Rujukan**: [NVIDIA SkillSpector](https://github.com/NVIDIA/skillspector) — Open-source AI Agent Skill Security Scanner.
- **Hasil Audit**: **100% LOLOS (CLEAN / SAFE)**.
  - **0** Celah Prompt Injection / Persona Hijacking.
  - **0** Upaya Eksfiltrasi Data (Data Exfiltration).
  - **0** Upaya Eskalasi Hak Akses (Privilege Escalation).
  - **0** Penggunaan Primitif Kode Berbahaya (`eval`, `exec`, `os.system`, `subprocess(shell=True)`) pada skrip eksekusi.
  - **0** Celah Supply Chain (tidak ada `curl | bash` atau unverified remote exec).
  - **0** Kerentanan MCP Tool Poisoning / Shadowing.

---

## 2. Metodologi Audit

Audit dilakukan menggunakan pipeline verifikasi bertingkat:
1. **Static Analysis & Regex Matching**: Pemindaian teks seluruh file `.md`, `.py`, `.json`, `.yaml` untuk mendeteksi karakter tersembunyi (zero-width characters, BiDi overrides), instruksi jailbreak, tautan webhook, dan pola `curl | bash`.
2. **AST (Abstract Syntax Tree) Code Parsing**: Pemeriksaan pohon sintaksis abstrak pada seluruh 27 file skrip Python (`.py`) untuk memverifikasi pemanggilan fungsi berbahaya secara deterministik tanpa false positive penamaan.
3. **Semantic Intent & Context Filtering**: Evaluasi kontekstual untuk membedakan antara kode eksploit nyata vs. aturan deteksi keamanan (seperti pada modul `cybersecurity` yang memang memuat tanda tangan malware untuk analisis).

---

## 3. Matriks Hasil Audit per Kategori Ancaman SkillSpector

| Dimensi Ancaman SkillSpector | Status | Evaluasi & Bukti Analisis |
|---|---|---|
| **1. Prompt Injection** | **AMAN** | • **0** karakter tersembunyi (`\u200B`, `\u200C`, `\u200D`, `\uFEFF`) atau BiDi/RTL override (`\u202A-\u202E`).<br>• Tidak ada hidden instruction dalam komentar HTML (`<!-- ... -->`).<br>• Seluruh skill dan persona dilengkapi *Prompt Defense Baseline* yang menolak instruksi `"ignore previous instructions"`, persona hijacking (DAN/developer mode), atau pembocoran sistem prompt.<br>• Modul `cybersecurity/SKILL.md` secara eksplisit memperlakukan kode masukan sebagai *untrusted data* dan menandai upaya prompt injection sebagai kerentanan kritis (`CWE-94`). |
| **2. Data Exfiltration** | **AMAN** | • Tidak ada transmisi kredensial (`.env`, `API_KEY`, `TOKEN`, `PASSWORD`) ke webhook pihak ketiga (pastebin, ngrok, requestbin, discord webhook).<br>• Skrip yang membutuhkan API (seperti Gemini pada skill `design`) hanya membaca env lokal `GEMINI_API_KEY` dan berkomunikasi langsung ke endpoint resmi Google Cloud.<br>• Kredensial sensitif (`GITHUB_PERSONAL_ACCESS_TOKEN`, `GOOGLE_APPLICATION_CREDENTIALS`) diatur via *Zero-Commit Policy* di `.env` lokal dan tidak pernah dibocorkan ke log/chat. |
| **3. Privilege Escalation** | **AMAN** | • **0** perintah `sudo`, `doas`, atau `chmod 777`.<br>• Aturan `AGENTS.md` (Pasal 1.1) mewajibkan verifikasi sesi (`getSessionUser()`) dan otorisasi ketat (`requireManagementAccess()`); melarang keras konsep *fail-open*.<br>• Tidak ada instruksi yang menyuruh agen memodifikasi permission sandbox atau membypass boundary keamanan. |
| **4. Malicious Code** | **AMAN** | • **Verifikasi AST Python**: 0 panggilan ke `eval()`, `exec()`, `os.system()`, atau `subprocess.Popen/run(..., shell=True)`.<br>• Skrip eksekusi seperti `ui-styling/scripts/shadcn_add.py` menggunakan array argumen eksplisit (`cmd = [pm, "dlx", "shadcn@latest", "add", ...]`) dengan `shell=False`.<br>• Pola `eval` atau reverse shell yang muncul pada `cybersecurity/references/threat-intelligence.md` merupakan *threat intelligence signatures* (kamus deteksi kerentanan OWASP/CWE), bukan kode yang dijalankan oleh skill. |
| **5. Supply Chain Attack** | **AMAN** | • **0** pola berbahaya `curl ... | bash` atau `wget ... | sh`.<br>• Skill `tdd-workflow` secara eksplisit memuat aturan: *"Require human review for shell commands, chained commands, and network installers; reject them when they are destructive or fetch-and-exec"*.<br>• Seluruh dependensi proyek dikunci secara deterministik melalui `pnpm-lock.yaml`. |
| **6. MCP Tool Poisoning** | **AMAN** | • Tidak ada tool MCP yang membayangi (*shadowing*) atau memanipulasi deskripsi native tool bawaan (`read_file`, `write_file`, `run_command`).<br>• Prinsip *Least Privilege* diterapkan pada seluruh server MCP aktif:<br>  - `postgres`: Terbatas pada read-only query (`postgres__query`). Mutasi dilarang via MCP.<br>  - `mtms-google-sheets`: Read-only (`spreadsheets.readonly`). Mutasi dilarang via MCP.<br>  - `github`: Operasi mutasi (`create_pull_request`, `push_files`, `merge_pull_request`) diisolasi di luar `alwaysAllow` sehingga mewajibkan konfirmasi manusia sebelum dieksekusi. |

---

## 4. Analisis False Positive (Penyaringan Konteks)

Selama pengujian statis otomatis, ditemukan kemunculan kata kunci tertentu pada direktori referensi. Verifikasi semantik mengonfirmasi bahwa seluruh temuan tersebut adalah **False Positive** yang aman:

1. **`cybersecurity/references/threat-intelligence.md`**:
   - *Pola*: `eval($c)`, `exec(/bin/bash ...)`, `/etc/passwd`, `curl ... | sh`.
   - *Konteks*: File ini adalah referensi deteksi ancaman malware dan web shell untuk agen keamanan (`security-reviewer` & skill `cybersecurity`) agar agen dapat mendeteksi kode berbahaya yang ditulis pengguna/pihak luar. Bukan kode yang dieksekusi oleh skill.
2. **`ui-ux-pro-max/scripts/tests/test_text_layout_resilience.py:41`**:
   - *Pola*: Kata `eval` terdeteksi pada teks `TestTextLayoutRetrieval`.
   - *Konteks*: Substring pencocokan nama kelas pengujian (`*Retrieval`), bukan fungsi `eval()`.
3. **`e2e-testing/SKILL.md:118`**:
   - *Pola*: `baseURL: process.env.BASE_URL || 'http://localhost:3000'`.
   - *Konteks*: Konfigurasi standar Playwright runner lokal.

---

## 5. Rekomendasi Penguatan Berkelanjutan

Untuk menjaga kepatuhan SkillSpector secara berkesinambungan:
1. **Pinning Versi Pip Opsional**: Pada panduan instalasi skrip lokal `design/SKILL.md`, sertakan rekomendasi pinning versi pustaka (misal `pip install "google-genai>=0.1.1" "pillow>=10.0.0"`).
2. **Automasi CI Scan**: Skrip audit scratch `skillspector_audit.py` dapat diadaptasi ke dalam workflow GitHub Actions (`.github/workflows/skills-security.yml`) untuk memvalidasi setiap perubahan pada `.agents/skills/` secara otomatis.
3. **Integritas MCP Settings**: Pertahankan generator script `scripts/setup/setup-cline-mcp.sh` sebagai sumber tunggal konfigurasi MCP lokal guna mencegah manipulasi manual konfigurasi runtime.
