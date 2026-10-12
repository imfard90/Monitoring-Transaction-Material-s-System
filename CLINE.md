# MTMS by CreDEa — Cline AI Agent Configuration

> Next.js 16 · Server Actions · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Table · TanStack Query · Kysely · Biome · Playwright · Framer Motion

This document defines the Cline AI agent configuration for the MTMS project. Cline will automatically load this configuration when working in this workspace.

## 📁 Project Structure

```
.cline/                          # Cline project configuration
  rules/                         # Coding standards and patterns (27 rules + README)
  workflows/                     # Slash command workflows (8 workflows)
  skills/                        # Project-specific skills (optional)

.agents/                         # Shared agent ecosystem
  skills/                        # 44 active skills (invoked via skills tool)
  agents/                        # 29 specialized agent personas
  rules/                         # Mirrored rules reference

bispro.md                        # Business process documentation (MANDATORY)
AGENTS.md                        # Cross-tool agent instructions
```

## ⚠️ MANDATORY: Business Process (Bispro)

**Before writing ANY code related to inventory, transactions, stock, warehouse, technician, or material features**, you MUST read:

📄 **`bispro.md`** (project root)

This document is the **single source of truth** for:
- All transaction flows (InOut Tag, Out SAP, Return Material, Transaction Used)
- Status flow and state transitions per module
- Stock balance rules (which operations add/subtract, which are audit-only)
- Validation rules (when to check stock, internal vs external WH)
- Data relationships (sap_out → transaction_used, return → accept_id, etc.)
- Decided business rules from Q&A sessions (Section 6)
- Recommended development priorities (Section 7)

**Rules:**
1. Always align your implementation with the flows and rules defined in `bispro.md`.
2. If a new feature or change conflicts with `bispro.md`, **ask the user** before proceeding.
3. After implementing a process change that alters business logic, **update `bispro.md`** to keep it in sync.
4. When creating stored procedures or server actions for inventory transactions, cross-check the aturan bisnis in `bispro.md`.

## 🔧 Available Workflows (Slash Commands)

Invoke workflows with `/workflow-name` in the chat:

| Command | Description | Arguments |
|---------|-------------|-----------|
| `/commit` | Quality checks (tsc, format, lint, unit tests), staging & push | `[optional-context]` |
| `/review` | Full code review: tsc + Biome format/lint + unit tests + security | `[file-or-directory]` |
| `/test` | Run Vitest unit & integration test suites, check coverage | `[target-path-or-suite]` |
| `/migrate` | Run and verify PostgreSQL database migrations via migration runner | `[dry-run\|status]` |
| `/security` | Security audit: OWASP Top 10 + API key + mtms-security-guide | `[file-or-directory]` |
| `/db-check` | Query DB via MCP, validate Kysely types | `[table-or-query]` |
| `/perf` | React/Next.js performance audit | `[component-path]` |
| `/new-page` | Scaffold new dashboard page + sidebar wiring | `<page-name> [desc]` |

Example usage:
```
/new-page stock-report Monthly stock balance report
/test tests/unit/api-auth.test.ts
/migrate
```

## 🎭 Custom Modes & Personas

Custom modes are configured in `.roomodes` and `.clinerules` for 4 primary engineering roles:
1. **Planner / Architect (`planner`)**: Focus on `bispro.md`, schema design, DDD, and SP contracts.
2. **Code Builder (`builder`)**: Implementation of Next.js 15, Server Actions, Kysely, Zod schemas, and UI design system.
3. **Code Reviewer (`reviewer`)**: Code quality, Biome formatting & linting, `tsc` checks, fail-closed authz audits.
4. **Security & Test Specialist (`security-tester`)**: OWASP audit, API rate limiting, Vitest unit & integration testing.
/review src/app/(DashboardLayout)/apps/inout-tag
/security src/lib/auth
/db-check inout_tag
/commit
```

## 📚 Rules System

Cline automatically loads rules from `.cline/rules/` based on file patterns. Rules are organized by concern:

**Common Rules** (apply to all files):
- `common-patterns.md` — Repository pattern, API responses, error handling
- `common-coding-style.md` — Naming, formatting, file organization
- `common-security.md` — Input validation, auth, secrets management
- `common-testing.md` — Test structure, coverage, mocking
- `common-performance.md` — Optimization patterns
- `common-git-workflow.md` — Branching, commits, PRs

**TypeScript Rules** (apply to `.ts`/`.tsx` files):
- `typescript-patterns.md` — Type design, generics, utility types
- `typescript-coding-style.md` — TS-specific conventions
- `typescript-security.md` — Type safety for security
- `typescript-testing.md` — TS test patterns

**React Rules** (apply to `.tsx`/`.jsx` files):
- `react-patterns.md` — Component patterns, RSC, state management
- `react-hooks.md` — Hook rules, custom hooks
- `react-coding-style.md` — Component structure
- `react-security.md` — XSS prevention, sanitization
- `react-testing.md` — Component testing

**Web Rules** (apply to web-related files):
- `web-patterns.md` — API design, routing, middleware
- `web-security.md` — OWASP, CORS, CSP
- `web-performance.md` — Caching, bundling, CDN
- `web-testing.md` — E2E, integration tests

All rules support conditional activation via frontmatter:
```yaml
---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
---
```

Toggle rules on/off via Cline's Rules panel (scale icon → Rules tab).

## 🎯 Skills System

Skills are specialized instruction sets loaded on demand. Cline discovers skills from:

1. **Shared skills**: `.agents/skills/` (44 active skills available in workspace)
2. **Project skills**: `.cline/skills/` (optional workspace extensions)

Cline invokes skills via the `skills` tool or matching context.

### MTMS-Specific & Design Skills

Located in `.agents/skills/`:

| Skill | When to Use |
|-------|-------------|
| `ui-ux-pro-max` | **Utama untuk UI/UX**: Sistem desain, warna/palet, tipografi, UX guidelines, aksesibilitas WCAG, responsive layout, chart, motion |
| `mtms-create-page` | Creating a new dashboard page and wiring the sidebar |
| `mtms-change-branding` | Rebranding app name, site title, meta description, logo |
| `better-auth` | Better Auth proxy setup, trustedOrigins, Nginx SSL, middleware |
| `mtms-security-guide` | Agentic security guide — attack vectors, prompt injection, AgentShield |

### Prioritas UX MTMS
1. **Form & Transaksi Domain** (Mutasi, Rekon, Return, SAP Out): Validasi Zod sinkron client-server, status loading/pending jelas pada tombol aksi, dialog konfirmasi untuk tindakan destruktif.
2. **Dashboard Operasional**: Data table (TanStack Table) dengan pagination server-side (`LIMIT`/`OFFSET`), status badge semantik, empty/error state informatif.
3. **Konsistensi & Aksesibilitas Lintas Halaman**: Kontras WCAG AA, navigasi keyboard (`focus-visible`), kepatuhan `prefers-reduced-motion`, dark mode otomatis via token tema Tailwind v4, teks pengguna Bahasa Indonesia yang ramah dan jelas.

### Active Framework & Architecture Skills

The workspace includes active curated skills:
- **Security**: `security-review`, `security-scan`, `cybersecurity`, `mtms-security-guide`
- **Frontend & React**: `react-patterns`, `react-performance`, `react-testing`, `nextjs-turbopack`, `ui-styling`, `motion-patterns`, `motion-foundations`, `motion-advanced`, `frontend-patterns`, `frontend-design-direction`, `frontend-a11y`, `accessibility`, `make-interfaces-feel-better`
- **Backend & Database**: `postgres-patterns`, `redis-patterns`, `database-migrations`, `api-design`, `backend-patterns`, `designing-data-intensive-applications`
- **Software Design & Quality**: `clean-architecture`, `clean-code`, `code-complete`, `domain-driven-design`, `a-philosophy-of-software-design`, `the-pragmatic-programmer`, `refactoring`, `refactoring-guru`, `working-effectively-with-legacy-code`, `coding-standards`, `error-handling`
- **Testing & Workflow**: `tdd-workflow`, `e2e-testing`, `browser-qa`, `git-workflow`

## 🤖 Agent Personas

Specialized personas in `.agents/agents/` (29 active personas) define expert roles for complex tasks:

| Persona | Focus Area |
|---------|------------|
| `code-reviewer` | Comprehensive code quality, dead code cleanup, patterns |
| `react-reviewer` | React 19/Next.js component quality and performance |
| `typescript-reviewer` | Strict typing, Kysely schema types, and Zod schemas |
| `security-reviewer` | OWASP Top 10, authz verification, secret leakage |
| `architect` | Architectural planning, boundaries, domain modeling |
| `performance-optimizer` | Bundle size, query optimization, render bottlenecks |
| `tdd-guide` | Test-driven development with Vitest |

In Cline, agents operate natively using workflows (`/review`, `/security`), the `skills` tool, and direct validation commands.

## 🗄️ Database & MCP Servers

**Mandatory MCP Usage**: The MTMS database schema already exists. **ALWAYS use the active PostgreSQL MCP server** for database operations instead of writing ad-hoc Node scripts.

MCP Server Configuration (in `~/.cline/data/settings/cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://user:pass@host:5432/gresik?sslmode=disable"
      ],
      "disabled": false,
      "alwaysAllow": ["query"]
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/project"
      ],
      "disabled": false
    },
    "context7": {
      "command": "npx",
      "args": [
        "-y",
        "@upstash/context7-mcp"
      ],
      "disabled": false
    }
  }
}
```

Use the MCP tools for:
- **postgres**: Executing queries directly to the MTMS database, database cleanups, testing schemas, ad-hoc troubleshooting, reading existing tables and columns, and understanding relations to map queries correctly with Kysely. Do **not** alter database structure unless explicitly instructed.
- **filesystem**: Safe file reading, directory tree inspection, and search within the project.
- **context7**: Real-time framework and library documentation lookup (e.g., Next.js, Tailwind v4, TanStack Query, Radix UI).

### Selective UI Component Adoption (shadcn/ui & shadcnspace)

- **Reuse first**: Always check `src/components/ui/` and `src/app/components/shared/` before proposing or adding any new component.
- **Selective adoption**: When evaluating new component patterns from shadcn/ui or shadcnspace:
  1. Map classes directly to MTMS Tailwind v4 design tokens (`--color-primary`, `--radius-*`, `--color-muted`, etc.) in `src/app/css/globals.css`.
  2. Maintain Radix UI base primitives — never create duplicate or parallel primitive folders.
  3. Comply with WCAG AA accessibility, visible `focus-visible`, and `prefers-reduced-motion` requirements.
  4. Never overwrite existing primitives in `src/components/ui/` without explicit necessity.

## 📝 Project Conventions

### Architecture: Server Actions vs TanStack Query

- **Server Actions** are the **default** for standard pages — Dashboard, Form Submit, CRUD operations
- **TanStack Query** is used **only** for interactive Client Components that need:
  - Infinite scroll, Real-time polling
  - Dynamic filter/search/table without page reload
  - Optimistic updates on complex interactive UIs
- Never mix both approaches in the same component

### Component Structure

- **Modular sub-components**: Split complex UI into focused, single-responsibility sub-components
- **Reusable components first**: ALWAYS check `src/app/components/shared/` and `src/components/ui/` before building custom UI
- Prefer primitives from `src/components/ui/` (shadcn/ui: Button, Card, Badge, Select, Tabs, Dialog, etc.)
- Icons: use **Iconify** (`@iconify/react`) — never generate SVG icons

### Database

- **PostgreSQL 18** as the primary database
- **Kysely** as the type-safe SQL query builder — never raw SQL strings
- **Transaction Control**: Critical transactions MUST use PostgreSQL functions with explicit transaction control (`BEGIN`, `COMMIT`, `ROLLBACK`)

### Validation & Utilities

- Use **Zod** for all schema validation
- Use **date-fns** for all date manipulation (not moment or dayjs)
- Use **Sonner** (`toast()`) for user-facing feedback
- Use **Redis** for caching via `ioredis`

### Code Quality (MANDATORY)

**Always run these checks after modifying code:**

```bash
# Type check — must pass with zero errors
pnpm tsc --noEmit

# Biome lint + format
pnpm dlx @biomejs/biome check --write .
```

Do not consider a task complete until these checks pass.

## 🚫 Don'ts

- Don't install new packages without asking the user
- Don't overwrite primitives in `src/components/ui/` without asking
- Don't create new CSS utility classes — use existing tokens
- Don't use `npm` or `yarn` — this project uses **pnpm**
- Don't use SWR — use Server Actions or TanStack Query as described above
- Don't write raw SQL — use Kysely's query builder
- Don't modify `.agents/` directly — it's the shared ECC ecosystem

## 🔐 Security

All sensitive configuration (API keys, DB credentials, secrets) must use `.env` — never hardcode.

For security audits, use `/security [target]` which loads:
- `mtms-security-guide` skill
- `cybersecurity` skill (8 parallel agents)
- OWASP Top 10 checklist
- STRIDE threat modeling

## 🎨 Styling

- Use **Tailwind CSS 4** with **CSS variables** as semantic design tokens
- Tokens defined in `src/app/css/globals.css` — never hardcode hex colors
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use **CVA** (`class-variance-authority`) for component variant definitions
- Animations via **Framer Motion** (`motion` components, `AnimatePresence`, variants)

## 🔄 Migration from Roo/Claude

This project previously used Roo Cline extensions. The migration is complete:

✅ **Rules**: Copied from `.agents/rules/` to `.cline/rules/` (29 files)
✅ **Workflows**: Migrated from `.roo/commands/` to `.cline/workflows/` (6 workflows)
✅ **Skills**: Cline auto-reads from `.agents/skills/` (200+ skills, no copy needed)
✅ **MCP**: Configuration documented above
⚠️ **Custom Modes**: Roo's `.roomodes` don't have direct Cline equivalent — converted to workflows

### What Changed

| Roo/Claude | Cline | Notes |
|------------|-------|-------|
| `.roo/commands/*.md` | `.cline/workflows/*.md` | Same format, invoke with `/workflow-name` |
| `.agents/rules/*.md` | `.cline/rules/*.md` | Copied, same frontmatter format |
| `.agents/skills/` | `.agents/skills/` | No change, Cline auto-reads |
| `.roo/mcp.json` | `~/.cline/data/settings/cline_mcp_settings.json` | MCP config moved to global |
| `.roomodes` | Workflows + this doc | Mode definitions converted to workflows |

## 🎯 Quick Start

1. Install Cline extension in VS Code
2. Read `bispro.md` for business processes
3. Review this `CLINE.md` for conventions
4. Use `/new-page` to scaffold features
5. Use `/review` before committing
6. Use `/commit` for conventional commits
7. Use `/security` before deployment

## 🆘 Troubleshooting

**Rules not activating?** Check file paths match glob patterns, verify rule is toggled on in Rules panel

**Skills not triggering?** Check skill description matches request, or invoke explicitly: `/skill-name`

**MCP postgres not working?** Verify MCP config in `~/.cline/data/settings/cline_mcp_settings.json`, test with `/db-check`

**Quality checks failing?** Run `pnpm tsc --noEmit` and `pnpm dlx @biomejs/biome check --write .`, or use `/review`

---

**Version**: 1.0.0 | **Date**: 2026-10-09 | **Maintained by**: CreDEa Development Team
