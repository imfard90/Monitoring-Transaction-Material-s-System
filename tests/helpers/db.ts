import { Pool } from 'pg';
import 'dotenv/config';

/**
 * Database helper for integration tests (P1-Q1: Test harness setup).
 *
 * Strategy: tests read from the live DB (read-only verification of migrations).
 * No destructive writes — each test queries metadata only, so they are safe to run
 * against a staging DB without cleanup.
 */

let _pool: Pool | null = null;

export function getPool(): Pool {
    if (!_pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL is required for integration tests');
        }
        _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
    return _pool;
}

export async function closePool(): Promise<void> {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
): Promise<T[]> {
    const pool = getPool();
    const res = await pool.query<T>(sql, params);
    return res.rows as T[];
}

export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
): Promise<T | undefined> {
    const rows = await query<T>(sql, params);
    return rows[0];
}
