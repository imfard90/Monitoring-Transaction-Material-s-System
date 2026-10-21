---
description: "Query MTMS database via MCP and validate Kysely type alignment"
argument-hint: "[table-name-or-sql-query]"
---

# `/db-check` — Database Check Workflow

> **MANDATORY**: Use `postgres__query` for read-only DB inspection. Do not use MCP to write. Schema changes go through reviewed migrations. Data-fix scripts require explicit owner approval and a verified target/rollback; see MTMS-DB-01 in `common-hooks.md`.

## Usage

```
/db-check
/db-check wo_lensa_header
/db-check SELECT COUNT(*) FROM inventory.wo_lensa_header
```

## Step-by-Step

### 1. No argument — Health check

Run a quick connectivity and schema sanity check:

```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname IN ('inventory', 'hr', 'auth', 'nte_inventory')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

### 2. Table name — Introspect structure

Run this via MCP `postgres__query`:

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = '<table>'
  AND table_schema = '<schema>'
ORDER BY ordinal_position;
```

Use the schema containing the requested object (for example, `inventory`, `hr`, `auth`, or `nte_inventory`). Then compare against the applicable Kysely type file and flag mismatches.

### 3. SQL query — Execute and return results

```sql
-- Prefer LIMIT 10 for data previews
SELECT *
FROM inventory.wo_lensa_header
WHERE end_status = 'open'
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Index analysis (optional — run manually if performance concern)

```sql
-- Find missing indexes on foreign keys
SELECT
  c.conrelid::regclass AS table_name,
  a.attname AS column,
  'FK — missing index' AS issue
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
  );
```

## Output Format

Report findings in this structure:

```
### DB Check Results

**Query Type**: [health-check | table-introspection | custom-sql | index-analysis]

**Schema** (if introspecting <table>):
| Column | Type | Nullable | Default |
|--------|------|----------|---------|

**Results** (first 10 rows):
...data or summary...

**Kysely Drift** (if schema mismatch found):
- `<column>`: DB says `<db_type>`, Kysely type says `<kysely_type>`
  → Suggestion: update `src/lib/db/database.types.ts`

**Action Items**:
- [ ] Run `pnpm tsc --noEmit` after type changes
- [ ] Create migration if schema changes needed
- [ ] Consider index if FK columns unindexed
```

## MCP vs. Script Rules

| Task | Tool |
|---|---|
| Read-only queries, introspection, health checks | **MCP `postgres__query`** — use this workflow |
| Explicitly approved non-inventory data fixes | Reviewed `src/lib/db/execute.ts` script, after confirming target and rollback; inventory mutations use approved procedures through repositories |
| Schema changes | Reviewed migration via `pnpm migrate` |

Never create ad-hoc Node scripts just to query the database. If MCP is unavailable, stop read-only inspection and report the limitation. `pnpm migrate` is only for reviewed migrations; it is not a query fallback.
