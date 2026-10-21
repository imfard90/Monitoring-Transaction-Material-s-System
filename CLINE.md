# MTMS by CreDEa — Cline AI Agent Configuration

> Next.js 16 · Server Actions · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Table · TanStack Query · Kysely · Biome · Playwright · Framer Motion

This document defines Cline AI agent configuration for the MTMS project. Cline will automatically load this configuration when working in this workspace.
## 📁 Project Structure

```
.cline/             # Cline configuration
  rules/            # Coding standards (27 rules + README)
  workflows/        # Slash command workflows (8 workflows)

.agents/           # Shared agent ecosystem
  skills/           # Skill guides discovered via SKILL.md
  agents/           # Persona reference profiles; not dispatched subagents
  rules/            # Canonical general engineering standards

bispro.md          # Business process documentation (MANDATORY)
AGENTS.md          # Cross-tool agent instructions (project root)
```

**Key locations**:
- `AGENTS.md` lives at the **project root** (not in `docs/`).
- `run-migration.ts` lives at the **project root** (not in `scripts/`).
- `scripts/` contains user-facing scripts (seeders, admin tools).

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
| `/migrate` | Run and verify PostgreSQL database migrations via migration runner | `[dry-run|status]` |
| `/security` | Security audit: OWASP Top 10 + API key + agentic security guide | `[file-or-directory]` |
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

Use `/review src/app/(DashboardLayout)/apps/inout-tag` to review a feature; use `/security src/lib/auth` for auth-focused audits; use `/db-check inout_tag` to inspect the DB schema.
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

1. **Shared skills**: `.agents/skills/` (discoverable guides use `SKILL.md`)
2. **Project skills**: `.cline/skills/` (optional workspace extensions)

Cline invokes skills via the `skills` tool or matching context.

### MTMS-Specific & Design Skills

Located in `.agents/skills/` (the active count is derived from `SKILL.md` files; do not maintain a numeric total):

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

## 🤖 Persona Reference Profiles

Markdown files in `.agents/agents/` are expert-role guidance for human review and agent behavior, not independently dispatched Cline subagents. Their presence does not imply runtime persona selection, delegation, or parallel execution. Apply relevant guidance directly when useful; use available skills, workflows, and direct validation commands for actual execution.

Discover current profiles from the files in `.agents/agents/`; do not maintain a static persona list here. Use `/review`, `/security`, the `skills` tool, and direct validation commands where appropriate.

## 🗄️ Database & MCP Servers

**Mandatory MCP Usage**: MTMS database schema already exists. **ALWAYS use the active PostgreSQL MCP server** for database operations instead of writing ad-hoc Node scripts.

### MCP Server Configuration

Postgres MCP configuration is local to the developer at `~/.cline/data/settings/cline_mcp_settings.json` and is not committed. Keep connection strings and credentials out of repository documentation, logs, and chat. Use the already-configured `postgres__query` tool for read-only queries; do not assume it permits writes or add a second server configuration here.

### MCP vs. Scripts: When to Use Which

| Task | Tool |
|------|------|
| Read-only DB queries (introspection, health checks, data previews) | **MCP `postgres__query`** — preferred |
| Explicitly approved non-inventory data fixes | Reviewed `src/lib/db/execute.ts` script after verifying target and rollback; inventory mutations must use approved procedures through repositories |
| Running migrations | `pnpm migrate` (root `run-migration.ts`) |

### Write Scripts — Use `src/lib/db/execute.ts`

Only run a write script when the owner explicitly authorizes the operation and the target, scope, and rollback are verified. Tool availability does not imply permission.

For an explicitly authorized standalone script that writes non-inventory data:

```ts
import 'dotenv/config';
import { createPool, executeWrite } from '@/lib/db/execute';

const pool = await createPool();
try {
  await executeWrite(pool, 'INSERT INTO ... VALUES ($1, $2)', [a, b]);
} finally {
  await pool.end();
}
```

See MTMS-DB-01 rule in `common-hooks.md` for the full pattern.

### Verification

Confirm MCP is working:
```
/db-check
```

If MCP is unavailable, stop read-only DB inspection and report the limitation. `src/lib/db/execute.ts` is only for explicitly authorized, reviewed non-inventory data fixes; inventory mutations must use approved procedures through repositories, and schema changes must go through `pnpm migrate`.


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

For security audits, use `/security [target]`. It directs the audit to:
- `.agents/skills/mtms-security-guide/security-guide.md` for agentic threat modeling, prompt injection, and secret exposure
- Available `cybersecurity` skill guidance for OWASP/MITRE/STRIDE, without assuming a fixed agent count
- MTMS-specific authorization, database, API, and NTE controls from `AGENTS.md` and `docs/NTE_SECURITY_WORKFLOW.md` when NTE is in scope

The NTE workflow is review guidance only; it does not authorize code changes, migrations, or data writes.

## 🎨 Styling

- Use **Tailwind CSS 4** with **CSS variables** as semantic design tokens
- Tokens defined in `src/app/css/globals.css` — never hardcode hex colors
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use **CVA** (`class-variance-authority`) for component variant definitions
- Animations via **Framer Motion** (`motion` components, `AnimatePresence`, variants)

## 🔄 Migration from Roo/Claude

This project previously used Roo Cline extensions. The migration is complete:

✅ **Rules**: `.cline/rules/` and `.agents/rules/` are maintained as related sources; reconcile behaviorally relevant differences against `AGENTS.md` and do not bulk-copy.
✅ **Workflows**: Available commands are the Markdown files currently present in `.cline/workflows/`.
✅ **Skills**: Cline discovers skills from `SKILL.md` files under `.agents/skills/`; no fixed count is maintained.

Active skill names listed in this guide are curated examples, not a complete inventory; discover the current set from `.agents/skills/**/SKILL.md`. Personas in `.agents/agents/` are reference profiles for human/agent guidance, not independently dispatched subagents in this Cline workspace. Use available skills, workflows, and direct verification commands; do not assume persona dispatch or parallel-agent capability.
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

**MCP not working?** Verify local MCP config without exposing credentials and run `/db-check` to confirm connectivity. If unavailable, report the read-only DB limitation; only explicitly approved data-fix scripts may use `src/lib/db/execute.ts`.

**Quality checks failing?** Run `pnpm tsc --noEmit` and `pnpm dlx @biomejs/biome check --write .`, or use `/review`

---

**Version**: 1.0.0 | **Date**: 2026-10-09 | **Maintained by**: CreDEa Development Team
