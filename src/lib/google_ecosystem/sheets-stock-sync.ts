import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { actionLogger } from '@/lib/logger';

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.join(DATA_DIR, 'other-stock.json');
const CACHE_FILE_TMP = path.join(DATA_DIR, 'other-stock.json.tmp');

// ─── Constants ────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = '1-oFsEmoyLk6VuVxQVKerB6235-kkaXNTndVWkCRAF6c';
const SHEET_RANGE = "'DATA KEMARIN'!A2:K50000";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OtherStockItem {
    regional: string;
    branch: string;
    gudang: string;
    materialCode: string;
    materialName: string;
    stockH1: number;
}

export interface OtherStockCache {
    syncedAt: string;
    rowCount: number;
    items: OtherStockItem[];
}

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

// Module-level cache: avoids reading the file on every request.
// TTL = 25 hours — slightly longer than the 24h cron interval to prevent
// a gap if the cron fires a few minutes late.
const IN_MEMORY_TTL_MS = 25 * 60 * 60 * 1000;

let memCache: OtherStockCache | null = null;
let memCacheLoadedAt = 0;

/**
 * Invalidate the in-memory cache so the next read picks up the fresh file.
 * Called automatically after a successful sync.
 */
function invalidateMemCache(): void {
    memCache = null;
    memCacheLoadedAt = 0;
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

/**
 * Read the cache from disk. Returns null if the file does not exist or is
 * unreadable; never throws.
 */
function readCacheFile(): OtherStockCache | null {
    try {
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        return JSON.parse(raw) as OtherStockCache;
    } catch {
        return null;
    }
}

/**
 * Write cache to disk atomically: write to a .tmp file first, then rename.
 * This prevents partial reads if the process is interrupted mid-write.
 */
function writeCacheFile(cache: OtherStockCache): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE_TMP, JSON.stringify(cache), 'utf-8');
    fs.renameSync(CACHE_FILE_TMP, CACHE_FILE);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the other-warehouse stock cache.
 *
 * Priority:
 *   1. In-memory cache (if within TTL)
 *   2. File on disk (`data/other-stock.json`)
 *   3. null — caller should surface a "data not yet synced" message
 */
export function loadOtherStockCache(): OtherStockCache | null {
    // 1. In-memory
    const now = Date.now();
    if (memCache !== null && now - memCacheLoadedAt < IN_MEMORY_TTL_MS) {
        return memCache;
    }

    // 2. Disk
    const fromDisk = readCacheFile();
    if (fromDisk !== null) {
        memCache = fromDisk;
        memCacheLoadedAt = now;
    }
    return fromDisk;
}

/**
 * Pull all rows from the `DATA KEMARIN` tab, keep only rows where
 * `QTY KEMARIN > 0`, and persist the result to `data/other-stock.json`.
 *
 * Columns (0-based):
 *   A=0 (key), B=1 (WITEL LAMA), C=2 (BRANCH), D=3 (WH),
 *   E=4 (PLANT), F=5 (Material), G=6 (Material description),
 *   H=7 (QTY KEMARIN), I=8 (KATEGORI), J=9 (KETERANGAN), K=10 (REGION)
 */
export async function syncOtherStock(): Promise<void> {
    const label = '[SheetsStockSync]';
    actionLogger.info(`${label} Starting sync from Google Sheets…`);

    const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialPath) {
        actionLogger.error(`${label} GOOGLE_APPLICATION_CREDENTIALS is not set — aborting sync.`);
        return;
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.resolve(credentialPath),
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEET_RANGE,
            valueRenderOption: 'FORMATTED_VALUE',
            majorDimension: 'ROWS',
        });

        const rows = response.data.values ?? [];
        actionLogger.info(`${label} Fetched ${rows.length} raw rows from Sheets.`);

        const items: OtherStockItem[] = [];

        for (const row of rows) {
            const rawQty = String(row[7] ?? '')
                .replace(/\./g, '')
                .replace(',', '.');
            const qty = Number.parseFloat(rawQty);
            if (!Number.isFinite(qty) || qty <= 0) continue;

            items.push({
                regional: String(row[10] ?? '-').trim(),
                branch: String(row[2] ?? '-').trim(),
                gudang: String(row[3] ?? '-').trim(),
                materialCode: String(row[5] ?? '').trim(),
                materialName: String(row[6] ?? '-').trim(),
                stockH1: qty,
            });
        }

        const cache: OtherStockCache = {
            syncedAt: new Date().toISOString(),
            rowCount: items.length,
            items,
        };

        writeCacheFile(cache);
        invalidateMemCache();

        actionLogger.info(
            `${label} Sync complete — ${items.length} items with qty > 0 written to ${CACHE_FILE}`
        );
    } catch (error) {
        actionLogger.error(
            `${label} Sync failed:`,
            error instanceof Error ? error : new Error(String(error))
        );
        // Do not rethrow — cron should continue running future schedules even
        // if one sync attempt fails.
    }
}
