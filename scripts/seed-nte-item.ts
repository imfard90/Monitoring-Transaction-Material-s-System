/**
 * Seed script: nte_inventory.mas_item_nte
 *
 * Bersihkan tabel lalu insert semua baris dari tmp/mas_item_nte.csv
 * Menggunakan pola reusable dari src/lib/db/execute.ts
 *
 * Jalankan: pnpm tsx scripts/seed-nte-item.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import { createPool, executeWrite } from '@/lib/db/execute';

const CSV_PATH = path.join(process.cwd(), 'tmp', 'mas_item_nte.csv');
const BATCH_SIZE = 100;

type NteRow = {
    type: string;
    merek: string;
    type_sn: string;
    item_description: string;
};

function deduplicateRows(rows: NteRow[]): NteRow[] {
    const uniqueRows = new Map<string, NteRow>();
    for (const row of rows) {
        uniqueRows.set(JSON.stringify([row.type, row.merek, row.type_sn]), row);
    }
    return [...uniqueRows.values()];
}

export { deduplicateRows };

/**
 *ponytail: CSV semicolon fields are assumed not to contain escaped semicolons;
 * upgrade to a CSV parser if the source format adds quoted delimiters.
 */
function parseRows(lines: string[]): NteRow[] {
    const header = lines[0]
        .replace(/^\uFEFF/, '')
        .toUpperCase()
        .split(';');
    const typeIdx = header.indexOf('TYPE');
    const merekIdx = header.indexOf('MEREK');
    const typeSnIdx = header.indexOf('TYPE SN');
    const itemDescIdx = header.indexOf('ITEM DESCRIPTION');
    if ([typeIdx, merekIdx, typeSnIdx, itemDescIdx].includes(-1)) {
        throw new Error('Header CSV tidak sesuai. Diharapkan: TYPE;MEREK;TYPE SN;ITEM DESCRIPTION');
    }
    return deduplicateRows(
        lines.slice(1).flatMap((line) => {
            const cols = line.split(';');
            if (cols.length < 4) return [];
            return [
                {
                    type: cols[typeIdx]?.trim() ?? '',
                    merek: cols[merekIdx]?.trim() ?? '',
                    type_sn: cols[typeSnIdx]?.trim() ?? '',
                    item_description: cols[itemDescIdx]?.trim() ?? '',
                },
            ];
        })
    );
}

export { parseRows };

async function main(): Promise<void> {
    // 1. Baca CSV
    let raw = fs.readFileSync(CSV_PATH, 'utf-8');
    // Hapus BOM UTF-8 di awal file
    if (raw.charCodeAt(0) === 0xfeff) {
        raw = raw.slice(1);
    }

    const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) {
        // eslint-disable-next-line no-console -- script output
        console.error('CSV kosong.');
        process.exit(1);
    }

    const rows = parseRows(lines);

    // eslint-disable-next-line no-console -- script output
    console.log(`📄 CSV: ${rows.length} baris`);

    // 2. Koneksi DB via reusable module
    const pool = await createPool();
    try {
        // eslint-disable-next-line no-console -- script output
        console.log('🗑️  TRUNCATE nte_inventory.mas_item_nte...');
        await executeWrite(pool, 'TRUNCATE nte_inventory.mas_item_nte RESTART IDENTITY');

        // eslint-disable-next-line no-console -- script output
        console.log('📥 Memasukkan data...');

        let inserted = 0;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);

            const values: string[] = [];
            const params: string[] = [];
            let paramIdx = 1;

            for (const row of batch) {
                values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`);
                params.push(row.type, row.merek, row.type_sn, row.item_description);
                paramIdx += 4;
            }

            const insertSQL =
                `INSERT INTO nte_inventory.mas_item_nte ` +
                `(type, merek, type_sn, item_description) ` +
                `VALUES ${values.join(', ')}`;

            await executeWrite(pool, insertSQL, params);
            inserted += batch.length;
            // eslint-disable-next-line no-console -- script output
            process.stdout.write(`\r Progress: ${inserted}/${rows.length} rows`);
        }

        // eslint-disable-next-line no-console -- script output
        console.log('\n✅ Selesai.');

        // 3. Verifikasi
        const { rows: count } = await pool.query<{ cnt: string }>(
            'SELECT COUNT(*) AS cnt FROM nte_inventory.mas_item_nte;'
        );
        // eslint-disable-next-line no-console -- script output
        console.log(`📊 Total rows di tabel: ${count[0].cnt}`);
    } finally {
        await pool.end();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err: unknown) => {
        // eslint-disable-next-line no-console -- script error output
        console.error('❌ Gagal:', err);
        process.exit(1);
    });
}
