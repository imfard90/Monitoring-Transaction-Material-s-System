# MTMS Rules System

## Structure

In MTMS, `.agents/rules/` is the canonical source for general engineering standards. `.cline/rules/` contains Cline-loaded copies and MTMS/Cline operational supplements. `AGENTS.md` remains authoritative for repository-specific security, business, and data requirements; do not assume same-named files are identical.

The rules are organized into:

```
.cline/rules/
├── common-*.md        # Universal engineering standards (8 rules)
│   ├── common-patterns.md
│   ├── common-coding-style.md
│   ├── common-security.md
│   ├── common-testing.md
│   ├── common-performance.md
│   ├── common-git-workflow.md
│   ├── common-development-workflow.md
│   └── common-agents.md
├── typescript-*.md    # TypeScript & JavaScript standards (4 rules)
│   ├── typescript-coding-style.md
│   ├── typescript-patterns.md
│   ├── typescript-security.md
│   └── typescript-testing.md
├── react-*.md         # Next.js & React 19 standards (5 rules)
│   ├── react-patterns.md
│   ├── react-hooks.md
│   ├── react-coding-style.md
│   ├── react-security.md
│   └── react-testing.md
└── web-*.md           # Web platform & UI design standards (7 rules)
    ├── web-design-quality.md
    ├── web-coding-style.md
    ├── web-patterns.md
    ├── web-performance.md
    ├── web-security.md
    ├── web-testing.md
    └── web-hooks.md
```

## Integrasi Google Sheets MTMS

- API aplikasi menggunakan library resmi `googleapis` dari modul server-only `src/lib/google_ecosystem/google-sheets-api.ts` untuk read/write yang tervalidasi.
- MCP development `mtms-google-sheets` tetap read-only dan memakai scope `spreadsheets.readonly`; jangan menambahkan tool mutasi ke MCP.
- Credential service account hanya melalui `GOOGLE_APPLICATION_CREDENTIALS`, tidak boleh dicatat atau di-commit. Write memerlukan izin Editor dan tidak diuji ke data nyata tanpa persetujuan.
- Lihat `src/lib/google_ecosystem/README.md` dan `.agents/skills/google-sheets/SKILL.md` untuk langkah pemakaian dan pengamanan.

## Tooling & Verification

The project enforces quality with **Biome**, **TypeScript (tsc)**, and **Vitest**:
- **Format**: `pnpm format`
- **Lint**: `pnpm lint`
- **Type Check**: `pnpm tsc --noEmit`
- **Unit Tests**: `pnpm test:unit`

## Rules vs Skills

- **Rules** define standards, conventions, and checklists that apply broadly across tasks (e.g., "80% test coverage", "no raw console.log in server actions", "validate with Zod").
- **Skills** (`.agents/skills/`) provide deep, actionable reference material for specific domains (e.g., `ui-ux-pro-max`, `postgres-patterns`, `better-auth`).

Rules tell you *what* standards to adhere to; skills provide *how-to* execution guidance.

## Agent and Workflow Discovery

- Discover skills from `.agents/skills/**/SKILL.md`, personas from `.agents/agents/*.md`, and workflows from `.cline/workflows/*.md`; do not rely on fixed counts or assume parallel-agent support.
- Use `CLINE.md` as the current workflow index and `.agents/skills/README.md` for skill guidance. Invoke available skills explicitly when relevant.
- For security posture of agent workflows, follow `.agents/skills/mtms-security-guide/security-guide.md` and `.cline/workflows/security.md`. For NTE security reviews, also follow `docs/NTE_SECURITY_WORKFLOW.md` and `docs/adr/002_nte_stored_procedures_and_warehouse_mapping.md`. These sources guide review; they do not authorize code changes, migrations, or data writes.
- `.agents/rules/` is canonical for general engineering standards. `.cline/rules/` may contain Cline/MTMS operational supplements; when same-named files differ, preserve those supplements and resolve conflicts against `AGENTS.md` and its named authoritative sources. Do not bulk-copy directories.
