'use server';

import { getSessionUser } from '@/lib/auth-server';
import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { bulkScrapeStockTeknisi } from '@/lib/services/bulk-stock-scraper';

export interface BulkScrapeJobResult {
    success: number;
    failed: number;
    total: number;
    message?: string;
}

export type BulkScrapeJobStatus =
    | { status: 'running'; processed?: number; total?: number; message?: string }
    | { status: 'success'; data: BulkScrapeJobResult; message: string }
    | { status: 'error'; error: string }
    | { status: 'not_found' };

/**
 * Manual trigger bulk stock scraping (Non-staff only).
 * Runs asynchronously via Redis job queue & atomic lock, returns jobId immediately.
 */
export async function triggerManualStockScraping(
    warehouseId?: number
): Promise<{ success: true; jobId: string } | { success: false; error: string }> {
    const LOCK_KEY = 'lock:bulk_stock_scrape';
    const LOCK_TTL = 3600; // 1 jam TTL

    try {
        const user = await getSessionUser();

        // Only non-staff can trigger manual scraping
        if (user.isStaff) {
            return {
                success: false,
                error: 'Akses ditolak. Hanya admin/supervisor yang dapat menjalankan scraping manual.',
            };
        }

        // Acquire active-job lock (atomic SET NX) to prevent concurrent / duplicate runs
        const acquired = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX');
        if (!acquired) {
            return {
                success: false,
                error: 'Scraping stok masal sedang berjalan di latar belakang. Coba lagi nanti.',
            };
        }

        const jobId = `bulk_stock_scrape_${Date.now()}`;
        await redis.set(
            `job:${jobId}`,
            JSON.stringify({ status: 'running', message: 'Memulai scraping seluruh teknisi...' }),
            'EX',
            3600
        );

        actionLogger.info(`Manual bulk stock scraping job ${jobId} triggered by ${user.nik}`);

        // Background worker execution (non-blocking)
        Promise.resolve().then(async () => {
            try {
                const result = await bulkScrapeStockTeknisi({
                    warehouseId,
                    onProgress: async (prog) => {
                        await redis.set(
                            `job:${jobId}`,
                            JSON.stringify({
                                status: 'running',
                                processed: prog.processed,
                                total: prog.total,
                                message: `Memproses ${prog.processed}/${prog.total} teknisi (${prog.success} sukses, ${prog.failed} gagal)...`,
                            }),
                            'EX',
                            3600
                        );
                    },
                });

                await redis.set(
                    `job:${jobId}`,
                    JSON.stringify({
                        status: 'success',
                        data: result,
                        message: `Scraper selesai: ${result.total} teknisi diproses (${result.success} berhasil, ${result.failed} gagal)`,
                    }),
                    'EX',
                    3600
                );
            } catch (error) {
                actionLogger.error(
                    'Manual stock scraping background worker failed',
                    error instanceof Error ? error : new Error(String(error))
                );
                await redis.set(
                    `job:${jobId}`,
                    JSON.stringify({
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Scraping masal gagal',
                    }),
                    'EX',
                    3600
                );
            } finally {
                await redis.del(LOCK_KEY);
            }
        });

        return {
            success: true,
            jobId,
        };
    } catch (error) {
        actionLogger.error(
            'Failed to trigger manual stock scraping',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal memulai scraping',
        };
    }
}

/**
 * Check the status of a bulk stock scraping job.
 */
export async function checkBulkScrapingStatus(jobId: string): Promise<BulkScrapeJobStatus> {
    try {
        const data = await redis.get(`job:${jobId}`);
        if (!data) return { status: 'not_found' };
        return JSON.parse(data) as BulkScrapeJobStatus;
    } catch (error) {
        actionLogger.error(
            `Failed to check bulk scraping status for job ${jobId}`,
            error instanceof Error ? error : new Error(String(error))
        );
        return { status: 'error', error: 'Gagal memeriksa status job' };
    }
}
