---
description: "Query MTMS database via MCP and validate Kysely type alignment"
argument-hint: "[table-name-or-sql-query]"
---

# Database Check Workflow

> **MANDATORY**: Use active `postgres` MCP server for ALL database operations in this workflow.
> Never write ad-hoc Node scripts. Use MCP postgres query tool directly.

1. If argument is a table name:

   ```sql
   -- Introspect table structure
   SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = '<table>'
   ORDER BY ordinal_position;
   ```

   Then compare with `src/lib/db/database.types.ts` — flag any mismatches.

2. If argument is a SQL query:

   Execute it via MCP postgres and return results.
   Example: `SELECT * FROM inout_tag WHERE status = 'Pending' LIMIT 10`

3. If no argument:

   Run general health checks:

   ```sql
   -- Check recent transactions
   SELECT schemaname, tablename, n_live_tup as row_count
   FROM pg_stat_user_tables
   ORDER BY n_live_tup DESC
   LIMIT 10;

   -- Check for missing indexes on foreign keys
   SELECT
     c.conrelid::regclass AS table_name,
     a.attname AS column_name,
     'Missing index on FK' AS issue
   FROM pg_constraint c
   JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
   WHERE c.contype = 'f'
     AND NOT EXISTS (
       SELECT 1 FROM pg_index i
       WHERE i.indrelid = c.conrelid
         AND a.attnum = ANY(i.indkey)
     );
   ```

4. Report findings:
   - Table structure mismatches (if table introspection)
   - Query results (if SQL query)
   - Health check summary (if no argument)

5. Suggest fixes:
   - Kysely type regeneration if schema drift detected
   - Index creation scripts if missing indexes found
   - Migration file templates if schema changes needed
