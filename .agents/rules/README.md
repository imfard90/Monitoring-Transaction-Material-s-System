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

## Rule Sources and Reconciliation

- `.agents/rules/` is the canonical source for general engineering standards.
- `.cline/rules/` is loaded by Cline and may include operational guidance specific to this workspace. It is not a second independent standard set.
- `AGENTS.md` remains authoritative for MTMS security, business, data, and repository-specific requirements.
- When same-named rules differ, preserve operational additions, resolve conflicts against `AGENTS.md`, and update both copies only when shared guidance changes. Never bulk-copy or replace a directory to force textual equality.
