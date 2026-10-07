import { db } from './src/lib/db/db';
import { sql } from 'kysely';

async function main() {
    const res = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'inventory' AND table_name = 'wo_lensa_header';
    `.execute(db);
    console.log(res.rows);
    process.exit(0);
}
main();
