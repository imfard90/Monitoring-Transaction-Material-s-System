# MTMS Model Context Protocol (MCP) Guide

Dokumentasi resmi arsitektur dan konfigurasi Model Context Protocol (MCP) di lingkungan Monitoring Transaction Material's System (MTMS).

---

## 1. Ringkasan Eksekutif

MTMS memanfaatkan arsitektur Model Context Protocol (MCP) untuk menyediakan antarmuka terstandarisasi, aman, dan terisolasi bagi agen AI (Cline, Antigravity, Gemini). Agen dapat mengakses basis data PostgreSQL, dokumentasi eksternal, Google Sheets, dan repositori GitHub tanpa perlu menulis skrip ad-hoc atau membeberkan kredensial di log/chat.

### Matriks MCP Server Aktif

| Server Key | Package / Path | Transport | Fungsi Utama | Kredensial / Konfigurasi |
|---|---|---|---|---|
| `postgres` | `@modelcontextprotocol/server-postgres` | stdio (`npx`) | Introspeksi skema dan read-only query DB | `postgresql://${DB_USER}:${DB_PASSWORD}@...` |
| `filesystem` | `@modelcontextprotocol/server-filesystem` | stdio (`npx`) | Akses dan inspeksi direktori proyek MTMS | Path direktori kerja lokal |
| `context7` | `@upstash/context7-mcp` | stdio (`npx`) | Query dokumentasi mutakhir (Next.js, Tailwind, dll.) | Tanpa kredensial khusus |
| `mtms-google-sheets` | `src/lib/google_ecosystem/google-sheets-mcp.ts` | stdio (`tsx`) | Read-only sinkronisasi data sheet stok eksternal | `GOOGLE_APPLICATION_CREDENTIALS` |
| `github` | `@modelcontextprotocol/server-github` | stdio (`npx`) | Manajemen PR, issue, commit, dan pencarian kode GitHub | `GITHUB_PERSONAL_ACCESS_TOKEN` |

---

## 2. GitHub MCP Server (`github`)

GitHub MCP Server menghubungkan agen AI langsung ke GitHub API untuk memfasilitasi workflow PR analysis, automated code review, pencarian referensi kode, dan pelacakan issue.

### 2.1 Konfigurasi

Server dijalankan melalui `npx` dengan membaca token akses personal dari environment:

```json
{
  "github": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-github"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "github_pat_..."
    },
    "disabled": false
  }
}
```

### 2.2 Kategori Tool yang Tersedia (Total: 26 Tools)

#### Pull Requests & Reviews
- `get_pull_request`: Mengambil metadata lengkap Pull Request (judul, deskripsi, status, author, base, head).
- `list_pull_requests`: Menampilkan daftar PR pada repositori berdasarkan state (open, closed, all).
- `get_pull_request_files`: Mengambil daftar file yang diubah dalam suatu PR beserta status patch.
- `get_pull_request_status`: Memeriksa status CI/CD checks pada PR.
- `get_pull_request_comments`: Mengambil komentar diskusi pada PR.
- `get_pull_request_reviews`: Mengambil riwayat approval/rejection review PR.
- `create_pull_request_review`: Menuliskan review resmi (APPROVE, REQUEST_CHANGES, COMMENT) disertai komentar per-baris.
- `create_pull_request`: Membuat Pull Request baru dari branch kerja ke base branch.
- `update_pull_request_branch`: Menyelaraskan (rebase/merge) branch PR dengan base branch.
- `merge_pull_request`: Menggabungkan PR yang telah diapprove.

#### Issues & Diskusi
- `get_issue`: Mengambil detail issue tertentu beserta label dan statusnya.
- `list_issues`: Menampilkan daftar issue aktif pada repositori.
- `create_issue`: Membuat issue baru untuk melacak bug atau task.
- `update_issue`: Mengubah status (open/closed), asignee, atau label issue.
- `add_issue_comment`: Menambahkan komentar tanggapan pada issue atau PR.
- `search_issues`: Pencarian issue atau PR menggunakan kueri sintaks GitHub search.

#### Repositori, Commits & Branch
- `list_commits`: Menampilkan riwayat commit pada branch tertentu dengan pagination.
- `create_branch`: Membuat branch git baru dari referensi commit tertentu.
- `search_repositories`: Mencari repositori yang relevan di bawah akun/organisasi.
- `fork_repository`: Melakukan fork repositori.
- `create_repository`: Membuat repositori baru.

#### Inspeksi Kode & File
- `search_code`: Melakukan pencarian simbol, fungsi, atau teks spesifik di seluruh kode repositori remote.
- `search_users`: Mencari profil user GitHub.
- `get_file_contents`: Membaca konten file dari remote branch tanpa checkout lokal.
- `create_or_update_file`: Melakukan commit file langsung ke GitHub remote.
- `push_files`: Mendorong perubahan beberapa file secara atomik.

---

## 3. Kebijakan Keamanan (Security & Permission Boundaries)

1. **Pemisahan Kredensial (Zero-Commit Policy)**:
   - Variabel `GITHUB_PERSONAL_ACCESS_TOKEN` disimpan di file `.env` lokal pengembang yang ada di `.gitignore`.
   - File template `.env.example` hanya memuat placeholder dan dokumentasi cara pembuatan token.
   - Konfigurasi MCP aktif berada di direktori lokal pengguna (`~/.gemini/config/mcp_config.json` dan `~/.cline/data/settings/cline_mcp_settings.json`), **bukan** di dalam repositori source code.

2. **Daftar Izin Otomatis (Cline `alwaysAllow`)**:
   Untuk mempercepat alur kerja inspeksi tanpa konfirmasi berulang, operasi **read-only** dimasukkan ke dalam `alwaysAllow`:
   - `search_repositories`, `get_file_contents`, `list_commits`, `list_issues`, `search_code`, `search_issues`, `search_users`, `get_issue`, `get_pull_request`, `list_pull_requests`, `get_pull_request_files`, `get_pull_request_status`, `get_pull_request_comments`, `get_pull_request_reviews`.

3. **Operasi Write Memerlukan Konfirmasi**:
   Aksi mutasi (`create_pull_request`, `create_issue`, `merge_pull_request`, `create_or_update_file`, `push_files`, `create_pull_request_review`) **tidak** dimasukkan ke dalam `alwaysAllow` agar agen wajib meminta persetujuan manusia sebelum mengeksekusinya.

4. **Scope Token GitHub (PAT)**:
   - Direkomendasikan menggunakan Fine-Grained Personal Access Token atau Classic PAT dengan scope minimum:
     - `repo` (Full control of private repositories) untuk repositori private.
     - `read:org`, `read:user` (opsional untuk metadata pengguna).

---

## 4. Cara Instalasi & Sinkronisasi

MTMS menyediakan skrip setup otomatis yang membaca seluruh kredensial dari `.env` dan memperbarui konfigurasi Cline serta Gemini/Antigravity secara simultan:

```bash
# 1. Pastikan GITHUB_PERSONAL_ACCESS_TOKEN sudah diatur di .env
grep GITHUB_PERSONAL_ACCESS_TOKEN .env

# 2. Jalankan skrip setup MCP
./scripts/setup/setup-cline-mcp.sh
```

Output skrip akan memvalidasi koneksi basis data PostgreSQL serta memverifikasi autentikasi GitHub API:
```text
╔════════════════════════════════════════════════════════════╗
║  MTMS MCP Configuration Setup                              ║
╚════════════════════════════════════════════════════════════╝
...
✅ Cline MCP configuration created at: ~/.cline/data/settings/cline_mcp_settings.json
✅ Gemini MCP configuration created at: ~/.gemini/config/mcp_config.json
🧪 Testing GitHub API authentication...
✅ GitHub authentication successful!
```

---

## 5. Integrasi dengan Agent Roles & Skills

- **`git-workflow` Skill**: Agen menggunakan tool GitHub MCP untuk membaca konteks PR sebelum merge, memeriksa riwayat commit di remote, atau memvalidasi konflik.
- **`pr-test-analyzer` Agent**: Mengambil daftar file yang berubah langsung melalui `get_pull_request_files` dan membaca isi PR via `get_pull_request` guna memverifikasi apakah ada celah cakupan tes unit.
- **`code-reviewer` Agent**: Memanfaatkan `get_pull_request_files` dan `create_pull_request_review` untuk memberikan review kode berbasis standar kepatuhan MTMS (keamanan, otorisasi, performa, dan validasi Zod).
