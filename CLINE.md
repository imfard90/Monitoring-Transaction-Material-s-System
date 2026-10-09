# MTMS by CreDEa — Cline AI Agent Configuration

> Next.js 16 · Server Actions · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Table · TanStack Query · Kysely · Biome · Playwright · Framer Motion

This document defines the Cline AI agent configuration for the MTMS project. Cline will automatically load this configuration when working in this workspace.

## 📁 Project Structure

```
.cline/                          # Cline project configuration
  rules/                         # Coding standards and patterns (29 rules)
  workflows/                     # Slash command workflows (6 workflows)
  skills/                        # Project-specific skills (optional)
  hooks/                         # Lifecycle hooks (optional)
  agents/                        # Custom agent definitions (optional)

.agents/                         # Shared agent ecosystem (ECC)
  skills/                        # 200+ skills (Cline auto-reads from here)
  agents/                        # 68 specialized agents
  workflows/                     # 94 workflows
  rules/                         # Additional rules (already copied to .cline/rules/)

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
| `/commit` | Commit and push with conventional commit message | `[optional-context]` |
| `/review` | Full code review: tsc + Biome + React/TS/security | `[file-or-directory]` |
| `/security` | Security audit: OWASP Top 10 + mtms-security-guide | `[file-or-directory]` |
| `/db-check` | Query DB via MCP, validate Kysely types | `[table-or-query]` |
| `/perf` | React/Next.js performance audit | `[component-path]` |
| `/new-page` | Scaffold new dashboard page + sidebar wiring | `<page-name> [desc]` |

Example usage:
```
/new-page stock-report Monthly stock balance report
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

Skills are on-demand instruction sets loaded only when relevant. Cline automatically discovers skills from:

1. **Project skills**: `.cline/skills/` (optional, for MTMS-specific skills)
2. **Shared skills**: `.agents/skills/` (200+ skills from ECC ecosystem)

### MTMS-Specific Skills

Located in `.agents/skills/`, these are auto-loaded by Cline:

| Skill | When to Use |
|-------|-------------|
| `mtms-create-page` | Creating a new dashboard page and wiring the sidebar |
| `mtms-change-branding` | Rebranding app name, site title, meta description, logo |
| `better-auth` | Better Auth proxy setup, trustedOrigins, Nginx SSL, middleware |
| `mtms-security-guide` | Agentic security guide — attack vectors, prompt injection, AgentShield |

### ECC Skills (200+)

The `.agents/skills/` directory contains skills from the Everything Claude Code (ECC) ecosystem:

- **Security**: `cybersecurity`, `testing-api-security-with-owasp-top-10`, `detecting-sql-injection-via-waf-logs`, etc.
- **Frameworks**: `nextjs-patterns`, `react-patterns`, `prisma-patterns`, `postgres-patterns`, etc.
- **Architecture**: `clean-architecture`, `domain-driven-design`, `hexagonal-architecture`, etc.
- **Testing**: `e2e-testing`, `python-testing`, `react-testing`, etc.

Skills auto-trigger based on description matching, or invoke explicitly:
```
/mtms-create-page
/better-auth
/cybersecurity
```

## 🤖 Agents

Specialized agents in `.agents/agents/` provide focused expertise:

| Agent | Purpose |
|-------|---------|
| `code-reviewer` | Comprehensive code quality and security review |
| `react-reviewer` | React-specific patterns and performance |
| `typescript-reviewer` | Type safety and TS best practices |
| `security-reviewer` | OWASP Top 10, vulnerability detection |
| `architect` | System design and architecture decisions |
| `performance-optimizer` | Performance analysis and optimization |
| `tdd-guide` | Test-driven development workflow |

Agents are automatically invoked by workflows (e.g., `/review` loads `code-reviewer`).

## 🗄️ Database & MCP

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
      ]
    }
  }
}
```

Use the MCP postgres tool for:
- Executing queries directly to the MTMS database
- Database cleanups, testing schemas, ad-hoc troubleshooting
- Reading existing tables and columns (introspection)
- Understanding relations (foreign keys, indexes) to map queries correctly with Kysely

Do **not** alter database structure unless explicitly instructed.

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
