# Agent Roles & Skill Orchestration

## Cline Execution Model in MTMS

In the Cline environment, specialized capabilities are orchestrated through:

1. **The `skills` tool**: Project and framework skills located in `.agents/skills/`; the active skill count is the number of `SKILL.md` files, not a maintained constant.
2. **Slash Command Workflows**: Operational routines located in `.cline/workflows/`; use only commands present in that directory.
3. **Persona reference profiles**: Guidance documents located in `.agents/agents/`; they are not independently dispatched agents in this Cline workspace. Treat their count as a file inventory, not a measure of active runtime agents.

## Mandatory Skill Invocation (Adapted from Superpowers)

**CRITICAL RULE: Before ANY response or action — including clarifying questions, exploring the codebase, or checking files — you MUST invoke relevant skills.**

- If there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke it.
- This is not negotiable. You cannot rationalize your way out of this.
- Skill check comes BEFORE clarifying questions, codebase exploration, or information gathering.
- Skills tell you HOW to explore, gather information, and execute tasks.

### Red Flags — STOP if you think:
| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "Let me gather information first" | Skills tell you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

### Skill Priority
When multiple skills apply, process skills come first — they set the approach, then implementation skills carry it out:
- Complex feature → `clean-architecture` / `domain-driven-design` first, then implementation skills.
- Bug fix → `tdd-workflow` / `diagnosing-bugs` first, then domain skills.
- Code review → `coding-standards` / `code-review` first.
- Security audit → `security-review` / `mtms-security-guide` first.

## Discovery and Source of Truth

- Persona files under `.agents/agents/` are descriptive reference profiles, not independently dispatched agents in this Cline workspace. Apply a profile's relevant guidance directly only when useful; do not assume autonomous dispatch, delegation, or parallel execution.
- Discover available skills from `.agents/skills/**/SKILL.md`, personas from `.agents/agents/*.md`, and workflows from `.cline/workflows/*.md`; do not rely on fixed counts or assume a workflow/parallel-agent feature exists.
- See `CLINE.md` for the workflow command index and `.agents/skills/README.md` for skill guidance. Invoke matching skills explicitly when relevant.
- For security posture of agent workflows and NTE-specific review, read `.agents/skills/mtms-security-guide/security-guide.md` and `docs/NTE_SECURITY_WORKFLOW.md`, respectively; neither document authorizes implementation or data writes.
- If `.cline/rules/` and `.agents/rules/` differ, check `AGENTS.md` and its named authoritative sources, apply the stricter applicable requirement, and align both copies for behaviorally relevant rule changes. Do not bulk-copy directories.

## Key Specialized Roles & Personas

When tackling distinct phases of development, apply relevant profile guidance and skills directly; profiles are not dispatched agents:

| Guidance profile (not dispatched) | Associated Skills & Tools | When to Apply |
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

---

## MTMS MCP: PostgreSQL Database Access

MTMS provides an **MCP (Model Context Protocol) server for PostgreSQL** that agents use to query the database directly without writing ad-hoc Node scripts.

### How to Access

Use the **`postgres__query`** tool exposed by the configured Postgres MCP server. The local MCP server key is `postgres`; tool names use the `postgres__` prefix.

### MCP vs. Scripts: When to Use Which

| Task | Tool |
|---|---|
| Read-only introspection (table structure, data preview, health checks) | **MCP `postgres__query`** tool — preferred |
| Read-only query with custom SQL | **MCP `postgres__query`** tool |
| Explicitly approved data fixes | Reviewed script via `src/lib/db/execute.ts`; verify target/rollback, never bypass inventory procedures |
| Running migrations | `pnpm migrate` (invokes `run-migration.ts`) |

### MCP Rules

- **Read-only**: The MCP `postgres` server is for read-only queries. Never attempt DB writes through MCP. Use reviewed migrations for schema changes and the approved write path only for explicitly authorized data fixes.
- **No ad-hoc scripts**: Do NOT create one-off Node scripts to query the DB. Use the MCP tool directly.
- **Query templates**: See `.cline/workflows/db-check.md` for standard introspection queries (table structure, index analysis, foreign key mapping).

### Verification

To confirm MCP is working:

```
/db-check
```

This workflow runs a health check query and confirms the MCP connection. If it fails, inspect the local MCP configuration at `~/.cline/data/settings/cline_mcp_settings.json` without copying or logging connection strings or credentials.
