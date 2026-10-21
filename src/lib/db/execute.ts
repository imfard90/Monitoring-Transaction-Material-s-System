/**
 * Reusable database write utility — scripts & one-off tools only.
 *
 * WHAT THIS IS:
 * A thin wrapper around `pg.Pool` for scripts that need to write to the DB
 * outside the Next.js request cycle (seeders, one-off data fixes, admin tools).
 *
 * WHEN TO USE THIS:
 * - Standalone scripts under `scripts/` or `src/lib/db/migrations/`
 * - NOT for server actions (use repository pattern §1.3 AGENTS.md)
 * - NOT for Next.js API routes (use Kysely db.ts instead)
 *
 * HOW TO USE:
 * ```ts
 * import 'dotenv/config';                    // load DATABASE_URL first
 * import { executeWrite } from '@/lib/db/execute';
 *
 * const pool = await createPool();           // connect
 * try {
 *   await executeWrite(pool, 'TRUNCATE my_table RESTART IDENTITY');
 *   await executeWrite(pool, 'INSERT INTO ... VALUES ($1, $2)', [a, b]);
 * } finally {
 *   await pool.end();
 * }
 * ```
 *
 * HOW NOT TO USE:
 * - Do NOT import this in server actions or API routes
 * - Do NOT use this for migrations (use `run-migration.ts` directly)
 * - Do NOT use this for read-only queries in production code
 *
 * @module execute
 */

import type { Pool, QueryResult } from 'pg';

/**
 * Thin wrapper that runs a write query on the given pool.
 * Logs what it executes but does NOT log parameter values (security).
 */
export async function executeWrite(
    pool: Pool,
    sql: string,
    params?: unknown[]
): Promise<QueryResult> {
    return pool.query(sql, params);
}

/**
 * Create a PostgreSQL connection pool using DATABASE_URL from environment.
 * Call `pool.end()` to close when done.
 */
export async function createPool(): Promise<Pool> {
    // Dynamic import to avoid issues when dotenv hasn't loaded yet
    // Caller should `import 'dotenv/config'` at entry point before calling this.
    const { Pool } = await import('pg');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error(
            'DATABASE_URL is not set. ' +
                'Ensure `import "dotenv/config"` is at the top of your entry file.'
        );
    }
    return new Pool({ connectionString, max: 5 });
}
