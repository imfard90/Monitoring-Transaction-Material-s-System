# Task Verification & Workflow Standards

## Cline Workflow System

Cline operates with slash command workflows located in `.cline/workflows/` and tool calls rather than automatic background shell hooks. Verification is performed proactively by the agent during and after task execution.

## Core Verification Phases

1. **Pre-Implementation**:
   - Read relevant business requirements (`bispro.md`) and security rules (`AGENTS.md`).
   - Formulate a clear, numbered plan before issuing file edits.
2. **Post-Implementation Verification**:
   - Run file-scoped Biome checks and lint for changed files; avoid global auto-format if unrelated user edits exist.
   - Verify type safety with `pnpm tsc --noEmit`.
   - Run relevant unit tests (`pnpm test:unit` for broad changes).
3. **Preserve existing work**: inspect `git status --short` before changes; never overwrite, reformat, stage, commit, or revert unrelated user edits.
4. **Session Completion**:
   - Run full verification checks or relevant slash commands (`/review`, `/security`, `/commit`).
   - Summarize changes, validation results, and any pending requirements.

## Task Tracking Best Practices

- Explicitly track multi-step progress in response plans (using markdown checklists `[ ]` / `[x]`).
- Break down tasks with clear granularity to enable real-time steering.
- Catch missing items, order discrepancies, or business logic edge cases before running code mutations.

---

## MTMS-DB-01: Database Write Tooling for Scripts

> **Scope**: Standalone scripts that need to write to PostgreSQL outside the Next.js request cycle (seeders, data fixes, one-off admin tools).

### Problem This Solves

When agents need to write data to the database from a standalone script (not a server action or API route), they were previously importing `pg.Pool` directly. This scattered the pattern and caused issues like missing `dotenv/config` (resulting in `ECONNREFUSED`).

### Standard Tool: `src/lib/db/execute.ts`

For an explicitly authorized standalone data-fix script, use `src/lib/db/execute.ts`. Tool availability is not authorization; schema changes use migrations, inventory mutations must use approved database procedures through repositories, and unapproved writes must not run.

```ts
// ✅ CORRECT — single entry point, dotenv loaded automatically
import 'dotenv/config';
import { createPool, executeWrite } from '@/lib/db/execute';

const pool = await createPool();
try {
  await executeWrite(pool, 'TRUNCATE my_table RESTART IDENTITY');
  await executeWrite(pool, 'INSERT INTO ... VALUES ($1, $2)', [a, b]);
} finally {
  await pool.end();
}
```

```ts
// ❌ WRONG — bypasses the standard tooling pattern
import { Pool } from 'pg';                          // scattered Pool usage
import 'dotenv/config';                              // easy to forget, causes ECONNREFUSED
const pool = new Pool({ connectionString: process.env.DATABASE_URL }); // duplicate pool config
```

### When to Use This Module

| Use Case | Tool |
|---|---|
| Migrations | `run-migration.ts` (directly, no wrapper needed) |
| Explicitly approved data fixes | Reviewed script via `src/lib/db/execute.ts`; inventory mutations remain procedure-only |
| Server Actions | Repository pattern via `src/lib/repositories/*.repository.ts` |
| Next.js API Routes | Kysely `db` from `src/lib/db/db.ts` |
| Read-only DB introspection | MCP `postgres` tool (preferred) |

### What `execute.ts` Provides

- **`createPool()`** — Creates a `pg.Pool` from `DATABASE_URL`. Validates the env var is set and throws a helpful error if missing.
- **`executeWrite(pool, sql, params?)`** — Thin wrapper around `pool.query()` that logs SQL text. Treat SQL itself as potentially sensitive; do not log credentials or confidential literals, and use parameterized values. It does not authorize a write.

### Biome Lint Exceptions

Scripts under `scripts/` are excluded from Biome's `noConsole` rule via the `scripts/**` override in `biome.json`. This is intentional so scripts can output progress and status messages. Server code must still use structured loggers (`actionLogger`, `dbLogger`, etc.).

### Enforcement

When writing or reviewing a script that connects to PostgreSQL:

1. Check whether it imports from `src/lib/db/execute.ts`
2. If it creates its own `Pool` directly from `pg`, refactor to use `createPool()`
3. If it calls `process.env.DATABASE_URL` without first importing `dotenv/config`, add the import
4. Confirm `pool.end()` is called in a `finally` block
