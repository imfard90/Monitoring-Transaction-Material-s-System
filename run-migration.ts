import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import 'dotenv/config';

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    const migrationPath = path.join(
        process.cwd(),
        'src/lib/db/migrations/008_add_formatted_date_to_wo_lensa.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
        console.log('Running migration...');
        await pool.query(sql);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

runMigration();
