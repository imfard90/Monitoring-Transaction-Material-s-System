# Agent Roles & Skill Orchestration

## Cline Execution Model in MTMS

In the Cline environment, specialized capabilities are orchestrated through:

1. **The `skills` tool**: Project and framework skills located in `.agents/skills/`; the active skill count is the number of `SKILL.md` files, not a maintained constant.
2. **Slash Command Workflows**: Operational routines located in `.cline/workflows/`; use only commands present in that directory.
3. **Persona reference profiles**: Guidance documents located in `.agents/agents/`; they are not independently dispatched agents in this Cline workspace. Treat their count as a file inventory, not a measure of active runtime agents.

## Discovery and Source of Truth

- Discover available skills from `.agents/skills/**/SKILL.md`, personas from `.agents/agents/*.md`, and workflows from `.cline/workflows/*.md`; do not rely on fixed counts or assume a workflow/parallel-agent feature exists.
- See `CLINE.md` for the workflow command index and `.agents/skills/README.md` for skill guidance. Invoke matching skills explicitly when relevant.
- For security posture of agent workflows and NTE-specific review, read `.agents/skills/mtms-security-guide/security-guide.md` and `docs/NTE_SECURITY_WORKFLOW.md`, respectively; neither document authorizes implementation or data writes.
- `.agents/rules/` is canonical for general engineering standards. `.cline/rules/` may contain Cline/MTMS operational supplements; when same-named files differ, preserve those supplements and resolve conflicts against `AGENTS.md` and its named authoritative sources. Do not bulk-copy directories.

## Key Specialized Roles & Personas

When tackling distinct phases of development, apply relevant profile guidance and skills directly; profiles are not dispatched agents:

| Role / Persona | Associated Skills & Tools | When to Apply |
|----------------|---------------------------|---------------|
| **Planner / Architect** | `clean-architecture`, `domain-driven-design` | Complex features, refactoring, database design |
| **Code Reviewer** | `coding-standards`, `code-complete`, `/review` | Reviewing modified code before commits |
| **Security Reviewer** | `security-review`, `mtms-security-guide`, `/security` | Auth changes, API keys, endpoints, DB access |
| **TDD / Test Guide** | `tdd-workflow`, `react-testing`, Vitest | Writing unit tests, reproducing bugs |
| **UI/UX Designer** | `ui-ux-pro-max`, `design-system`, `motion-patterns` | Frontend layouts, forms, tables, accessibility |
| **Database Specialist**| `postgres-patterns`, `database-migrations`, `/db-check` | Stored procedures, Kysely queries, schemas |

## Immediate Role Activation

Proactively apply these methodologies without waiting for user prompting:
1. **Complex Feature Requests**: Plan architectural changes, check `bispro.md` and `AGENTS.md`.
2. **Code Modified**: Validate with Biome (`pnpm format`, `pnpm lint`) and `pnpm tsc --noEmit`.
3. **Bug Fixes**: Write failing unit tests with Vitest before fixing implementation.
4. **Security Surfaces**: Ensure server actions check `getSessionUser()`/`getSessionNik()` and validate input schemas with Zod.

## Multi-Perspective Analysis

When solving complex architectural or security problems:
- **Factual Review**: Check database constraints, foreign keys, and stored procedure signatures.
- **Security Check**: Enforce auth, input sanitization, API rate limiting, and secret redaction.
- **Consistency Check**: Align with existing patterns in `src/lib/repositories/` and `src/components/ui/`.
