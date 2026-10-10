import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import 'dotenv/config';

/**
 * Migration runner — menjalankan semua file .sql di src/lib/db/migrations/ secara berurutan.
 *
 * Perubahan (P0-D4):
 * - Tidak lagi hardcode single file; baca semua *.sql urut leksikografis.
 * - process.exit(1) on failure agar CI gagal.
 * - Tracking migrasi via tabel inventory._migration_log.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/lib/db/migrations');
const MIGRATION_LOG_TABLE = 'inventory._migration_log';

async function ensureMigrationLogTable(pool: Pool): Promise<void> {
    await pool.query(`
        CREATE SCHEMA IF NOT EXISTS inventory;
        CREATE TABLE IF NOT EXISTS ${MIGRATION_LOG_TABLE} (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            filename VARCHAR NOT NULL UNIQUE,
            executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

async function getExecutedMigrations(pool: Pool): Promise<Set<string>> {
    const result = await pool.query<{ filename: string }>(
        `SELECT filename FROM ${MIGRATION_LOG_TABLE} ORDER BY filename`
    );
    return new Set(result.rows.map((r) => r.filename));
}

async function runMigrations(): Promise<void> {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        console.log('📊 Migration runner starting...');
        console.log(`   Directory: ${MIGRATIONS_DIR}`);

        if (!fs.existsSync(MIGRATIONS_DIR)) {
            throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
        }

        // Ensure tracking table exists
        await ensureMigrationLogTable(pool);

        // List all .sql files sorted lexicographically (ensures 001 → 002 → ... → 010)
        const files = fs
            .readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.endsWith('.sql'))
            .sort();

        if (files.length === 0) {
            console.log('   No migration files found.');
            return;
        }

        // Detect duplicate prefixes (e.g., two files starting with 009_)
        const prefixes = files.map((f) => f.split('_')[0]);
        const duplicates = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
        if (duplicates.length > 0) {
            console.warn(
                `⚠️  WARNING: Duplicate migration prefix detected: ${duplicates.join(', ')}`
            );
            console.warn(
                '   Files will run in lexicographic order. Consider renaming to avoid ambiguity.'
            );
        }

        const executed = await getExecutedMigrations(pool);
        let runCount = 0;

        for (const file of files) {
            if (executed.has(file)) {
                console.log(`   ✓ SKIP (already executed): ${file}`);
                continue;
            }

            const filePath = path.join(MIGRATIONS_DIR, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            console.log(`   → RUNNING: ${file}`);

            await pool.query('BEGIN');
            try {
                await pool.query(sql);
                await pool.query(
                    `INSERT INTO ${MIGRATION_LOG_TABLE} (filename) VALUES ($1)`,
                    [file]
                );
                await pool.query('COMMIT');
                console.log(`   ✓ DONE: ${file}`);
                runCount++;
            } catch (error) {
                await pool.query('ROLLBACK');
                throw new Error(`Migration failed: ${file}\n${error}`);
            }
        }

        console.log(`✅ Migration complete. ${runCount} file(s) executed, ${executed.size} skipped.`);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigrations();
