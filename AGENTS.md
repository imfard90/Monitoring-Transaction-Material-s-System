# MTMS by CreDEa — AI Agent Rules

> Next.js 16 · Server Actions · Tailwind CSS 4 · shadcn/ui (Radix) · TanStack Table · TanStack Query · Kysely · Biome · Playwright · Framer Motion

## ⚠️ MANDATORY: Business Process (Bispro)

**Before writing ANY code related to inventory, transactions, stock, warehouse, technician, or material features**, you MUST read the business process document:

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

## 🤖 AI Agent Ecosystem

- **MANDATORY**: Always utilize the specialized agents, skills, and rules located in the `.agents/` directory for any task (including UI/UX design, architecture, security, and refactoring).
- The `.agents/` directory contains the following skill suites — invoke the relevant one before making decisions:

| Suite | Skills | Use When |
|-------|--------|----------|
| **ECC (Everything Claude Code)** | 68 agents, 122 rules, 94 workflows | General dev, TDD, code review, architecture |
| **UI/UX Pro Max** | `ui-ux-pro-max` — 79 styles, 192 palettes, 74 font pairings | Component design, color, typography, chart |
| **Hallmark** | `hallmark` — anti-AI-slop, 21 themes, 4 verbs | Greenfield pages, redesign, design audit |
| **Book Skills** | `clean-code`, `clean-architecture`, `domain-driven-design`, etc. | Code quality, refactoring, architecture |
| **SecOpsAgentKit** | `secops-appsec`, `secops-devsecops`, `secops-threatmodel`, `secops-compliance`, `secops-incident-response`, `secops-offsec`, `secops-secsdlc` | Tooling-based security (semgrep, ZAP, trivy) |
| **Cybersecurity Audit** | `cybersecurity` — 8 parallel agents, OWASP/MITRE/STRIDE | Full security code audit, vulnerability scan |
| **Anthropic Cyber Skills** | `testing-*`, `detecting-*`, `implementing-*`, `exploiting-*` (41 curated skills) | Specific attack/defense: JWT, OAuth, SQL injection, XSS, CSRF, API security |
| **MTMS-Specific** | `mtms-create-page`, `mtms-change-branding`, `better-auth`, `mtms-security-guide` | MTMS workflows |

### Skill Loading Strategy

Skills are classified as **DAILY** (always active) or **LIBRARY** (load on demand). See `.agents/skills/skill-library/SKILL.md` for the full routing table. Loading all skills simultaneously wastes ~40-60% of context window — use LIBRARY skills only when the specific need arises.

## 🎛️ Roo Modes

This project has 9 custom modes in `.roomodes`:

| Mode | Slug | Use When |
|------|------|----------|
| **⚡ Vibecode** | `vibecode` | Rapid feature implementation — skip planning, go straight to production-quality MTMS code |
| **🗄️ DB Architect** | `db-architect` | Schema design, Kysely type generation, migration planning, stored procedures, query optimization |
| **🎨 UI Builder** | `ui-builder` | Building/redesigning UI components, pages, design system elements |
| **🔐 Security Audit** | `security-audit` | Security audits, pre-deployment checks, auth/authorization/payment features |
| **🏗️ Architect** | `architect` | Plan, design, strategize before implementation |
| **💻 Code** | `code` | Write, modify, refactor code |
| **❓ Ask** | `ask` | Explanations, documentation, technical questions |
| **🪲 Debug** | `debug` | Troubleshoot issues, investigate errors |
| **🪃 Orchestrator** | `orchestrator` | Complex multi-step projects, coordinate across specialties |

## 🛠️ Roo Commands

Available slash commands in `.roo/commands/`:

| Command | File | What It Does |
|---------|------|--------------|
| `/commit` | `commit.md` | Conventional commit with Biome + tsc checks |
| `/review` | `review.md` | Full code review: tsc + Biome + react/typescript/security reviewers |
| `/security` | `security.md` | Security audit: OWASP Top 10, mtms-security-guide, cybersecurity skill |
| `/db-check` | `db-check.md` | DB ops via MCP postgres: introspection, health, missing index detection |
| `/perf` | `perf.md` | React/Next.js perf audit: waterfalls, bundle, SSR, re-renders |
| `/new-page` | `new-page.md` | Scaffold new dashboard page via mtms-create-page skill + bispro.md check |


## Project structure

```
.external_scrapping/                # Playwright scraper for Lensa integration
src/
  app/
    (DashboardLayout)/              # dashboard shell (sidebar + header)
      layout/
        header/                     # top header component
        sidebar/                    # sidebar navigation
        shared/                     # shared layout utilities
      apps/                         # feature routes (blog, notes, tickets, …)
      icons/ types/ utilities/      # supporting routes
      sample-page/ user-profile/    # misc routes
      layout.tsx  page.tsx          # dashboard entry
    api/                            # API route handlers
    auth/                           # authentication pages
    components/                     # app-level shared components (e.g. service-worker)
    context/                        # React context providers (blog-context, …)
    css/                            # global stylesheets
      globals.css                   # Tailwind CSS + design tokens
    layout.tsx                      # root layout (SSR, font, ThemeProvider)
    manifest.ts  not-found.tsx
  components/
    ui/                             # shadcn/ui primitives (Button, Card, Dialog, …)
    theme-provider.tsx              # next-themes wrapper
  lib/
    utils.ts                        # cn() and utility functions
```

Drill into a specific folder to discover its files — naming is kebab-case for files, PascalCase for component exports.

## Next.js

This project uses **Next.js 16** with the App Router. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Conventions

- App Router with `(DashboardLayout)` route group for the main dashboard shell.
- Dashboard layout is a Client Component (`"use client"`) with Sidebar + Header; root `layout.tsx` stays SSR.
- File naming: kebab-case for files, PascalCase for component exports.
- Package manager: **pnpm** — always use `pnpm` for install/add/remove commands.

## Architecture: Server Actions vs TanStack Query

- **Server Actions** are the **default** for standard pages — Dashboard, Form Submit, CRUD operations. Keep data fetching and mutations on the server; use `"use server"` functions.
- **TanStack Query** (`@tanstack/react-query`) is used **only** for interactive Client Components that need:
  - Infinite scroll
  - Real-time polling
  - Dynamic filter/search/table without page reload
  - Optimistic updates on complex interactive UIs
- Never mix both approaches in the same component — pick one based on the use case above.

## Styling rules

- Use **Tailwind CSS 4** with **CSS variables** as semantic design tokens.
- Tokens are defined in `src/app/css/globals.css` — never hardcode hex colors.
- Use `cn()` from `@/lib/utils` (clsx + tailwind-merge) for conditional class merging.
- Use **CVA** (`class-variance-authority`) for component variant definitions.
- Do NOT create new CSS utility classes — use existing tokens and Tailwind utilities.
- Animations and transitions via **Framer Motion** (`motion` components, `AnimatePresence`, variants).

## Component rules

- **Modular sub-components**: Never place all code into a single monolithic file. Split complex UI into focused, single-responsibility sub-components in separate files (e.g. `header.tsx`, `filter-bar.tsx`, `card-item.tsx`).
- **Reusable components first**: ALWAYS check `src/app/components/shared/` and `src/components/ui/` for existing reusable components (e.g., `DataTable`, `DataTablePagination`, `DateRangePicker`, `StatusBadge`) BEFORE building custom UI. If you find yourself duplicating UI layout, table rendering, or complex logic across multiple feature pages, you MUST abstract it into a reusable component.
- **Follow React composition best practices**:
    - **Single Responsibility**: Keep sub-components focused on one concern—separate container/state logic from presentational rendering.
    - **Composition over prop drilling**: Prefer passing `children` or using compound component patterns over passing deeply nested props through intermediate layers.
    - **Avoid inline render helpers**: Extract repeated or section-level JSX into dedicated sub-component files rather than helper functions like `renderHeader()` inside `index.tsx`.
    - **Typed prop contracts**: Define explicit, strongly typed interfaces for each sub-component in `types.ts` or co-located with the sub-component.
- Prefer primitives from `src/components/ui/` (**shadcn/ui**: Button, Card, Badge, Select, Tabs, Dialog, Sheet, Drawer, etc.) over raw HTML or third-party equivalents.
- Icons: use **Iconify** (`@iconify/react`) as the primary icon library. Never generate SVG icons — use letter placeholders if no icon is available.
- Add `"use client"` directive when the component uses hooks, event handlers, or browser APIs.

## Authentication

- Use **Better Auth** for authentication and session management.

## Database

- **PostgreSQL 18** as the primary database.
- **pg Pool** for connection pooling.
- **Kysely** as the type-safe SQL query builder — use Kysely's fluent API for all queries, never raw SQL strings.
- **Transaction Control**: All credential and critical transactions (e.g. inventory processing) MUST be encapsulated within PostgreSQL database functions or stored procedures using explicit transaction control (`BEGIN`, `COMMIT`, `ROLLBACK`) to guarantee data integrity.

## Caching / Redis

- Use **Redis** for caching data to improve performance, especially for frequently accessed or heavy queries.
- Connect to Redis using `ioredis` (or a similar lightweight client).
- Connection configuration must use the `REDIS_URL` and `REDIS_PASS` environment variables from `.env`. Never hardcode credentials.

## Validation

- Use **Zod** for all schema validation — form inputs, API request bodies, server action parameters, and environment variables.

## Utilities

- Use **date-fns** for all date manipulation and formatting. Do NOT use `moment` or `dayjs`.

## Notifications

- Use **Sonner** (`toast()`, `toast.success()`, `toast.error()`) for user-facing feedback. `Toaster` should be mounted globally.

## Theming

- Dark/light mode via **next-themes** (`ThemeProvider` wrapping the app in root layout).
- Default theme: `system`, with `attribute="class"` for Tailwind dark mode.

## PWA / Service Worker

- **Serwist** (`@serwist/turbopack`) for PWA support with Turbopack-compatible service worker.
- Service worker registration is handled in `src/app/components/service-worker/`.
- Use Serwist's precaching and runtime caching strategies — don't manually write `sw.js`.

## Tables

- **TanStack React Table** (`@tanstack/react-table`) for sorting, filtering, and pagination.
- Keep types, column definitions, mappings, and skeletons in separate feature files.
- Render cells via `flexRender`; use Badges for status columns.
- **Data Loading Performance**: Untuk menjaga *performance*, *default load* dari database dibatasi hanya untuk data sampai **5 bulan terakhir**. Jika data tidak ditemukan pada saat pengguna melakukan pencarian (hasil *filter* kosong), sistem akan secara otomatis (secara progresif) memuat (load) data untuk 5 bulan sebelumnya, dan seterusnya. Pastikan *server-action* dan *client component* disesuaikan dengan pola ini.

## Code quality

- **Biome** for linting, formatting, and import sorting — config in `biome.json`.
- Run `pnpm check` to lint + format check, `pnpm format` to auto-format, `pnpm lint` to lint only.
- **Mandatory Verification**: ALWAYS run `npx tsc --noEmit` (or `pnpm tsc --noEmit`) to type-check and `pnpm dlx @biomejs/biome check --write .` to fix linting/formatting errors after modifying code. Do not consider a task complete until these checks pass.
- **Agent Rules & Workflows**: Always involve and follow the rules, skills, and workflows defined in the `.agents` directory for any implementation task.

## Don'ts

- Don't install new packages without asking the user.
- Don't overwrite primitives in `src/components/ui/` without asking.
- Don't create new CSS utility classes — use existing tokens.
- Don't place dashboard pages outside the `(DashboardLayout)` route group unless intentional.
- Don't use `npm` or `yarn` — this project uses **pnpm**.
- Don't use SWR — use Server Actions or TanStack Query as described above.
- Don't write raw SQL — use Kysely's query builder.

## Requirements

- Preserve all existing features and application logic — do not remove functionality.
- All sensitive configuration (API keys, DB credentials, secrets) must use `.env` — never hardcode.
- Avoid duplicated logic — extract shared code into reusable utilities or components.
- Use responsive design (mobile-first where appropriate).

## Documentation & Research

- When using external libraries or APIs, always search for their official documentation.
- Save documentation research and reference snippets as markdown files inside the relevant skill folder under `.agents/skills/` to serve as a knowledge base for future tasks.

## MTMS-Specific Skills

The following skills in `.agents/skills/` are specific to this project:

| Skill | When to Use |
|-------|-------------|
| `mtms-create-page` | Creating a new dashboard page and wiring the sidebar |
| `mtms-change-branding` | Rebranding app name, site title, meta description, logo |
| `better-auth` | Better Auth proxy setup, trustedOrigins, Nginx SSL, middleware |
| `mtms-security-guide` | Agentic security guide — attack vectors, prompt injection, AgentShield |

## Database introspection & MCP Priority

The database schema already exists. **ALWAYS check for an active PostgreSQL MCP Server (e.g. `postgres`). If an active database MCP server is available, you MUST use its `query` tool to execute queries or interact with the database directly instead of writing ad-hoc Node scripts.**

Use the active MCP Database Tool for:
- Executing queries directly to the MTMS database.
- Database cleanups, testing schemas, and ad-hoc troubleshooting.
- Reading existing tables and columns (introspection).
- Understanding relations (foreign keys, indexes) to map queries correctly with Kysely's type-safe builder.

Do **not** alter database structure unless explicitly instructed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
