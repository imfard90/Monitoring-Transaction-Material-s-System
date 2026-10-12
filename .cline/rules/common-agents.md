# Agent Roles & Skill Orchestration

## Cline Execution Model in MTMS

In the Cline environment, specialized capabilities are orchestrated through:
1. **The `skills` tool**: Project and framework skills located in `.agents/skills/` (44 active skills).
2. **Slash Command Workflows**: Standard operational routines located in `.cline/workflows/` (`/commit`, `/review`, `/security`, `/db-check`, `/perf`, `/new-page`).
3. **Specialized Agent Personas**: Instruction profiles located in `.agents/agents/` (29 active personas) that guide specific tasks.

## Key Specialized Roles & Personas

When tackling distinct phases of development, adopt the appropriate persona and skills:

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
