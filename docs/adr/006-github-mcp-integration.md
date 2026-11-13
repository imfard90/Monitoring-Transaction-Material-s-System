# ADR-006: Integrasi GitHub Model Context Protocol (MCP) Server

- **Status**: Accepted
- **Tanggal**: 2026-11-14
- **Pengusul**: AI Agent & Dev Lead
- **Komponen Terdampak**: Agent Tooling, MCP Configurations, Development Workflows, PR & Code Review Agents

## 1. Konteks (Context)

Dalam alur pengembangan MTMS, AI agen (Cline / Antigravity) sering membutuhkan interaksi terstruktur dengan repositori GitHub:
1. Membaca dan menganalisis Pull Request (`get_pull_request`, `get_pull_request_files`, `get_pull_request_comments`).
2. Meninjau riwayat commit dan branch remote (`list_commits`, `create_branch`).
3. Menelusuri issue, feedback review, dan mencari referensi kode lintas repository (`search_code`, `search_issues`, `list_issues`).
4. Memberikan feedback review otomatis (`create_pull_request_review`, `add_issue_comment`).

Sebelumnya, operasi GitHub hanya dapat dilakukan secara manual lewat browser, CLI lokal (`git` dasar), atau script ad-hoc yang berisiko membocorkan kredensial atau melanggar prinsip kepatuhan proyek. Dengan disediakannya token `GITHUB_PERSONAL_ACCESS_TOKEN` pada file `.env` lokal pengembang, diperlukan standarisasi integrasi akses GitHub melalui protokol MCP (Model Context Protocol).

## 2. Keputusan (Decision)

1. Mengadopsi server MCP resmi GitHub: `@modelcontextprotocol/server-github` via `npx` stdio transport.
2. Memasukkan server `github` ke konfigurasi MCP lokal:
   - Antigravity / Gemini CLI: `~/.gemini/config/mcp_config.json`
   - Cline (VS Code extension): `~/.cline/data/settings/cline_mcp_settings.json`
3. Memperbarui generator script otomatis `scripts/setup/setup-cline-mcp.sh` agar membaca `GITHUB_PERSONAL_ACCESS_TOKEN` dari file `.env` lokal tanpa pernah meng-commit token ke version control.
4. Mendokumentasikan template variabel di `.env.example`.
5. Memperbarui rules dan persona agen (`.agents/rules/common-agents.md`, `.cline/rules/common-agents.md`, `pr-test-analyzer`, `code-reviewer`) serta skill `git-workflow` untuk memanfaatkan tool MCP GitHub secara konsisten.

### Konfigurasi Standar

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      },
      "disabled": false
    }
  }
}
```

Daftar tool aman (read-only) dimasukkan ke dalam `alwaysAllow` pada konfigurasi Cline untuk menghindari interupsi konfirmasi berulang pada aksi baca:
- `search_repositories`
- `get_file_contents`
- `list_commits`
- `list_issues`
- `search_code`
- `search_issues`
- `search_users`
- `get_issue`
- `get_pull_request`
- `list_pull_requests`
- `get_pull_request_files`
- `get_pull_request_status`
- `get_pull_request_comments`
- `get_pull_request_reviews`

Aksi modifikasi (seperti `create_pull_request`, `create_issue`, `merge_pull_request`, `create_or_update_file`, `push_files`) tetap berada di luar `alwaysAllow` agar agen selalu meminta konfirmasi eksplisit kepada pengembang sebelum melakukan write ke repository.

## 3. Konsekuensi (Consequences)

### Positif
- Akses terstruktur ke GitHub API berbasis kontrak JSON-RPC standar MCP.
- Agen dapat mengotomatisasi analisis coverage PR (`pr-test-analyzer`) dan review kode mendalam (`code-reviewer`) langsung terhadap diff remote.
- Kredensial terlindungi di layer environment pengembang; tidak ada hardcoded PAT di repository.
- Menghilangkan kebutuhan script cURL / node ad-hoc untuk mengecek status issue atau commit GitHub.

### Kompromi / Trade-off
- Memerlukan Node.js dan `npx` pada mesin lokal untuk mengeksekusi `@modelcontextprotocol/server-github`.
- Pengembang harus membuat GitHub Personal Access Token (PAT) dengan scope minimal (`repo` untuk private repository) di akun GitHub masing-masing.

## 4. Alternatif yang Dipertimbangkan

- **Alternatif A: GitHub CLI (`gh`) via shell command**:
  Ditolak sebagai interface utama agen karena output CLI tidak terstruktur, rentan terhadap perbedaan format output antar versi, dan memerlukan instalasi binary terpisah.
- **Alternatif B: REST API script ad-hoc**:
  Ditolak karena melanggar aturan MTMS (dilarang membuat ad-hoc query scripts) dan berisiko membocorkan token ke riwayat terminal atau log file.
