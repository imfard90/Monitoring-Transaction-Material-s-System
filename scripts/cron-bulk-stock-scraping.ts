/**
 * Cron runner: bulk scraping stock teknisi Lensa.
 * Terjadwal pada: 00:30, 05:00, 11:00, 19:00, 22:00 WIB
 * (Juga dapat dijalankan manual via CLI).
 *
 * Usage:
 *   pnpm tsx scripts/cron-bulk-stock-scraping.ts
 *
 * Env:
 *   BATCH_SIZE  (default 50)  — jumlah teknisi per batch
 *   OFFSET      (default 0)   — offset batch (untuk lanjutkan)
 */

import 'dotenv/config';
import { closeBrowser } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { bulkScrapeStockTeknisi } from '@/lib/services/bulk-stock-scraper';

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 50);
const OFFSET = Number(process.env.OFFSET ?? 0);
const LOCK_KEY = 'lock:bulk_stock_scrape';
const LOCK_TTL = 1800; // 30 menit

async function main() {
    actionLogger.info(
        `[CRON CLI] Bulk stock scraping start — batch=${BATCH_SIZE} offset=${OFFSET}`
    );

    const acquired = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX');
    if (!acquired) {
        actionLogger.warn(
            '[CRON CLI] Bulk stock scraping skipped: another scraping job holds the lock.'
        );
        process.exitCode = 0;
        return;
    }

    try {
        const result = await bulkScrapeStockTeknisi({ batchSize: BATCH_SIZE, offset: OFFSET });

        actionLogger.info(
            `[CRON CLI] Selesai: total=${result.total} success=${result.success} failed=${result.failed}`
        );

        const failures = result.details.filter((d) => d.status === 'failed');
        if (failures.length > 0) {
            actionLogger.warn(
                `[CRON CLI] ${failures.length} scraping gagal: ${failures.map((f) => `${f.nik}: ${f.error}`).join(', ')}`
            );
        }

        process.exitCode = result.failed > 0 ? 1 : 0;
    } catch (error) {
        actionLogger.error(
            '[CRON CLI] Fatal error:',
            error instanceof Error ? error : new Error(String(error))
        );
        process.exitCode = 1;
    } finally {
        await redis.del(LOCK_KEY);
        await closeBrowser().catch(() => {});
    }
}

main();
