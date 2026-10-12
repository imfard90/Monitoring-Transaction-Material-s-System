---
description: "Run and verify MTMS PostgreSQL database migrations via migration runner"
argument-hint: "[dry-run|status]"
---

# Database Migration Workflow

> **MANDATORY**: Follow database migration rules (§1.4 in `AGENTS.md`).
> Migrations must be idempotent, sequentially numbered, and tracked in `inventory._migration_log`.

1. Review migration files in `src/lib/db/migrations/`:
   - Check filenames for sequential order (`001_...`, `002_...`, ..., `020_...`)
   - Verify unique prefix numbering (no duplicate numbers)
   - Verify idempotent DDL (`CREATE OR REPLACE`, `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

2. Execute database migration runner:
   ```bash
   pnpm migrate
   # or: pnpm tsx run-migration.ts
   ```
   - Wraps each migration in an atomic transaction (`BEGIN/COMMIT/ROLLBACK`)
   - Tracks executed migrations in `inventory._migration_log`
   - Exits with status code 1 on failure

3. Verify migration status and schema health:
   - Run integration tests (if `DATABASE_URL` is configured):
     ```bash
     pnpm test:integration tests/integration/migrations.test.ts
     ```
   - Or use `/db-check` workflow to introspect schema changes

4. Verify Kysely type sync:
   - If tables, columns, or views were altered, update `src/lib/db/database.types.ts`
   - Run type check to ensure application alignment:
     ```bash
     pnpm tsc --noEmit
     ```

5. Report status:
   - List of applied migrations
   - Integration test results
   - Schema type alignment confirmation
