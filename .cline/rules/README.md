# MTMS Rules System

## Structure

In MTMS, rules in `.cline/rules/` define coding standards, security guardrails, architectural conventions, and validation checklists. Cline automatically loads these rules when working in the workspace.

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
