import 'dotenv/config';
import cron from 'node-cron';
import {
    OTHER_STOCK_SYNC_LOCK_KEY,
    OTHER_STOCK_SYNC_LOCK_TTL_SECONDS,
    syncOtherStock,
} from '@/lib/google_ecosystem/sheets-stock-sync';
import { closeBrowser } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { acquireLock } from '@/lib/redis-lock';
import { scraperLogRepository } from '@/lib/repositories/scraper-log.repository';
import { bulkScrapeStockTeknisi } from '@/lib/services/bulk-stock-scraper';
import { executeOutLensaScraping } from '@/lib/services/lensa-out-service';
import { executeWOLensaScraping } from '@/lib/services/lensa-wo-service';
import {
    WORKER_HEARTBEAT_KEY,
    WORKER_HEARTBEAT_TTL_SECONDS,
    WORKER_QUEUE_KEY,
    type WorkerJob,
} from '@/lib/workers/worker-client';

actionLogger.info('====================================================');
actionLogger.info('[MTMS-WORKER] Dedicated Background Worker Initializing');
actionLogger.info(`[MTMS-WORKER] Process ID: ${process.pid}`);
actionLogger.info(`[MTMS-WORKER] Node Env: ${process.env.NODE_ENV || 'development'}`);
actionLogger.info('====================================================');

let isRunning = true;
let isJobActive = false;

// Dedicated Redis connection for blocking queue pops
const queueRedis = redis.duplicate();
queueRedis.on('error', (err) => {
    actionLogger.error(
        '[MTMS-WORKER] Queue Redis error:',
        err instanceof Error ? err : new Error(String(err))
    );
});

// ----------------------------------------------------
// 1. Heartbeat Management
// ----------------------------------------------------
const sendHeartbeat = async () => {
    try {
        await redis.set(
            WORKER_HEARTBEAT_KEY,
            JSON.stringify({
                pid: process.pid,
                timestamp: Date.now(),
                uptime: process.uptime(),
            }),
            'EX',
            WORKER_HEARTBEAT_TTL_SECONDS
        );
    } catch (err) {
        actionLogger.warn('[MTMS-WORKER] Heartbeat failed:', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

void sendHeartbeat();
const heartbeatInterval = setInterval(() => {
    if (isRunning) {
        void sendHeartbeat();
    }
}, 5000);

// ----------------------------------------------------
// 2. Cron Tasks Implementation
// ----------------------------------------------------
const schedules = [
    { time: '0 4 * * *', perpage: 100 }, // 04:00
    { time: '30 9 * * *', perpage: 20 }, // 09:30
    { time: '30 12 * * *', perpage: 20 }, // 12:30
    { time: '0 15 * * *', perpage: 20 }, // 15:00
    { time: '0 18 * * *', perpage: 20 }, // 18:00
    { time: '0 21 * * *', perpage: 100 }, // 21:00
    { time: '0 23 * * *', perpage: 100 }, // 23:00
];

const runScrapers = async (perpage: number) => {
    try {
        actionLogger.info(`[CRON] Running Lensa scrapers perpage=${perpage}...`);
        await executeOutLensaScraping(perpage, 'system');
        actionLogger.info(`[CRON] Lensa scrapers perpage=${perpage} completed.`);
        actionLogger.info('[CRON] Running WO Lensa scrapers...');
        await executeWOLensaScraping(undefined, undefined, 'system');
        actionLogger.info('[CRON] WO Lensa scrapers completed.');
    } catch (error) {
        actionLogger.error(
            '[CRON] Error during scheduled scraping:',
            error instanceof Error ? error : new Error(String(error))
        );
    }
};

const stockScrapeSchedules = [
    { time: '30 6 * * *', label: '06:30 WIB' },
    { time: '0 10 * * *', label: '10:00 WIB' },
    { time: '0 13 * * *', label: '13:00 WIB' },
    { time: '0 16 * * *', label: '16:00 WIB' },
    { time: '30 18 * * *', label: '18:30 WIB' },
    { time: '30 21 * * *', label: '21:30 WIB' },
    { time: '30 23 * * *', label: '23:30 WIB' },
];

const otherStockSchedules = [
    { time: '0 5 * * *', label: '05:00 WIB' },
    { time: '0 10 * * *', label: '10:00 WIB' },
    { time: '0 13 * * *', label: '13:00 WIB' },
    { time: '0 17 * * *', label: '17:00 WIB' },
    { time: '0 20 * * *', label: '20:00 WIB' },
];

const runBulkStockScraper = async (label: string, action: 'system' | 'manual' = 'system') => {
    const LOCK_KEY = 'lock:bulk_stock_scrape';
    const LOCK_TTL = 1800; // 30 minutes

    const lock = await acquireLock(LOCK_KEY, LOCK_TTL);
    if (!lock) {
        actionLogger.warn(
            `[CRON] Bulk stock scraping (${label}) skipped; another scraping job is running.`
        );
        return;
    }

    try {
        actionLogger.info(`[CRON] Starting bulk technician stock scraping (${label})...`);
        const result = await bulkScrapeStockTeknisi();
        const resume = `${result.success} sukses, ${result.failed} gagal dari ${result.total} teknisi (${label})`;
        actionLogger.info(`[CRON] Bulk technician stock scraping (${label}) completed: ${resume}`);
        await scraperLogRepository
            .insertLog({
                scraper_type: 'stock_teknisi',
                action,
                resume_result: resume,
            })
            .catch((err) => {
                actionLogger.warn('[CRON] Gagal mencatat log scraper_cronjob_log:', err);
            });
    } catch (error) {
        actionLogger.error(
            `[CRON] Error during bulk stock scraping (${label}):`,
            error instanceof Error ? error : new Error(String(error))
        );
        await scraperLogRepository
            .insertLog({
                scraper_type: 'stock_teknisi',
                action,
                resume_result: `Gagal: ${error instanceof Error ? error.message : String(error)}`,
            })
            .catch((err) => {
                actionLogger.warn('[CRON] Gagal mencatat log scraper_cronjob_log:', err);
            });
    } finally {
        await lock.release();
        await closeBrowser().catch(() => {});
    }
};

const runLockedStockSync = async (context: string): Promise<boolean> => {
    const lock = await acquireLock(OTHER_STOCK_SYNC_LOCK_KEY, OTHER_STOCK_SYNC_LOCK_TTL_SECONDS);
    if (!lock) {
        actionLogger.warn(`[${context}] Sheets stock sync skipped; another sync is running.`);
        return false;
    }

    try {
        await syncOtherStock();
        return true;
    } finally {
        await lock.release();
    }
};

const runWithRetry = async (
    context: string,
    maxAttempts = 3,
    action: 'system' | 'manual' = 'system'
): Promise<void> => {
    const delaysMs = [30_000, 60_000];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const completed = await runLockedStockSync(context);
            if (!completed) throw new Error('Another stock sync currently holds the lock.');
            const resume = `Sukses sinkronisasi Google Sheets (${context})`;
            actionLogger.info(
                `[${context}] Sheets stock sync succeeded (attempt ${attempt}/${maxAttempts}).`
            );
            await scraperLogRepository
                .insertLog({
                    scraper_type: 'other_stock',
                    action,
                    resume_result: resume,
                })
                .catch((err) => {
                    actionLogger.warn('[CRON] Gagal mencatat scraper_cronjob_log:', err);
                });
            return;
        } catch (err) {
            actionLogger.error(
                `[${context}] Sheets stock sync attempt ${attempt}/${maxAttempts} failed:`,
                err instanceof Error ? err : new Error(String(err))
            );
            if (attempt < maxAttempts) {
                const delayMs = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];
                actionLogger.info(`[${context}] Retrying Sheets stock sync in ${delayMs / 1000}s.`);
                await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }
    actionLogger.error(`[${context}] All ${maxAttempts} Sheets sync attempts failed.`);
    await scraperLogRepository
        .insertLog({
            scraper_type: 'other_stock',
            action,
            resume_result: `Gagal: Semua ${maxAttempts} percobaan sinkronisasi Sheets gagal (${context})`,
        })
        .catch((err) => {
            actionLogger.warn('[CRON] Gagal mencatat scraper_cronjob_log:', err);
        });
};

// ----------------------------------------------------
// 3. Register Scheduled Crons
// ----------------------------------------------------
for (const schedule of schedules) {
    cron.schedule(schedule.time, () => void runScrapers(schedule.perpage), {
        timezone: 'Asia/Jakarta',
    });
}

for (const schedule of stockScrapeSchedules) {
    cron.schedule(schedule.time, () => void runBulkStockScraper(schedule.label), {
        timezone: 'Asia/Jakarta',
    });
}

for (const schedule of otherStockSchedules) {
    cron.schedule(schedule.time, () => void runWithRetry(`CRON ${schedule.label}`), {
        timezone: 'Asia/Jakarta',
    });
}

actionLogger.info('[CRON] Registered all cron schedules in Asia/Jakarta timezone.');

// Startup Google Sheets sync
void runWithRetry('STARTUP');

// ----------------------------------------------------
// 4. Job Queue Processor (Manual Triggers from Web)
// ----------------------------------------------------
const handleWorkerJob = async (job: WorkerJob) => {
    isJobActive = true;
    actionLogger.info(`[MTMS-WORKER] Executing job: ${job.id} (${job.type})`);

    try {
        switch (job.type) {
            case 'scrape:out-lensa': {
                await redis.set(
                    `job:${job.id}`,
                    JSON.stringify({
                        status: 'running',
                        message: 'Scraping Out Lensa berjalan...',
                    }),
                    'EX',
                    3600
                );
                const result = await executeOutLensaScraping(job.perpage, 'manual');
                if (result.success) {
                    await redis.set(
                        `job:${job.id}`,
                        JSON.stringify({ status: 'success', data: result }),
                        'EX',
                        3600
                    );
                } else {
                    await redis.set(
                        `job:${job.id}`,
                        JSON.stringify({ status: 'error', error: result.error }),
                        'EX',
                        3600
                    );
                }
                break;
            }

            case 'scrape:wo-lensa': {
                await redis.set(
                    `job:${job.id}`,
                    JSON.stringify({ status: 'running', message: 'Scraping WO Lensa berjalan...' }),
                    'EX',
                    3600
                );
                const result = await executeWOLensaScraping(
                    job.perpage,
                    job.fullLoop ?? true,
                    'manual'
                );
                if (result.success) {
                    await redis.set(
                        `job:${job.id}`,
                        JSON.stringify({ status: 'success', data: result }),
                        'EX',
                        3600
                    );
                } else {
                    await redis.set(
                        `job:${job.id}`,
                        JSON.stringify({ status: 'error', error: result.message }),
                        'EX',
                        3600
                    );
                }
                break;
            }

            case 'scrape:bulk-stock': {
                await redis.set(
                    `job:${job.id}`,
                    JSON.stringify({
                        status: 'running',
                        message: 'Memulai scraping seluruh stok teknisi...',
                    }),
                    'EX',
                    3600
                );

                const result = await bulkScrapeStockTeknisi({
                    warehouseId: job.warehouseId,
                    onProgress: async (prog) => {
                        await redis.set(
                            `job:${job.id}`,
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

                const resume = `${result.success} sukses, ${result.failed} gagal dari ${result.total} teknisi (Manual)`;
                await scraperLogRepository
                    .insertLog({
                        scraper_type: 'stock_teknisi',
                        action: 'manual',
                        resume_result: resume,
                    })
                    .catch((err) => {
                        actionLogger.warn('[WORKER] Gagal mencatat log scraper_cronjob_log:', err);
                    });

                await redis.set(
                    `job:${job.id}`,
                    JSON.stringify({
                        status: 'success',
                        data: result,
                        message: `Scraper selesai: ${result.total} teknisi diproses (${result.success} berhasil, ${result.failed} gagal)`,
                    }),
                    'EX',
                    3600
                );
                break;
            }

            case 'sync:sheets': {
                await redis.set(
                    `job:${job.id}`,
                    JSON.stringify({ status: 'running', message: 'Sinkronisasi Google Sheets...' }),
                    'EX',
                    3600
                );
                await runWithRetry(job.context || 'JOB', 3, 'manual');
                await redis.set(
                    `job:${job.id}`,
                    JSON.stringify({ status: 'success', message: 'Sinkronisasi Sheets berhasil' }),
                    'EX',
                    3600
                );
                break;
            }
        }
    } catch (err) {
        actionLogger.error(
            `[MTMS-WORKER] Job ${job.id} failed:`,
            err instanceof Error ? err : new Error(String(err))
        );
        await redis.set(
            `job:${job.id}`,
            JSON.stringify({
                status: 'error',
                error: err instanceof Error ? err.message : 'Unknown worker error',
            }),
            'EX',
            3600
        );
    } finally {
        if (job.type === 'scrape:out-lensa') {
            await redis.del('lock:out_lensa_scrape');
        } else if (job.type === 'scrape:wo-lensa') {
            await redis.del('lock:wo_lensa_scrape');
        } else if (job.type === 'scrape:bulk-stock') {
            await redis.del('lock:bulk_stock_scrape');
        }
        await closeBrowser().catch(() => {});
        isJobActive = false;
    }
};

const processQueue = async () => {
    while (isRunning) {
        try {
            // Wait up to 2 seconds for a job
            const result = await queueRedis.brpop(WORKER_QUEUE_KEY, 2);
            if (result && result.length === 2) {
                const jobData = result[1];
                try {
                    const parsedJob = JSON.parse(jobData) as WorkerJob;
                    await handleWorkerJob(parsedJob);
                } catch (parseErr) {
                    actionLogger.error(
                        '[MTMS-WORKER] Invalid JSON in job queue:',
                        parseErr instanceof Error ? parseErr : new Error(String(parseErr))
                    );
                }
            }
        } catch (err) {
            if (isRunning) {
                actionLogger.error(
                    '[MTMS-WORKER] Error while popping from queue:',
                    err instanceof Error ? err : new Error(String(err))
                );
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }
};

void processQueue();

// ----------------------------------------------------
// 5. Graceful Shutdown
// ----------------------------------------------------
const gracefulShutdown = async (signal: string) => {
    actionLogger.info(`[MTMS-WORKER] Received ${signal}. Starting graceful shutdown...`);
    isRunning = false;
    clearInterval(heartbeatInterval);

    try {
        // Wait up to 25 seconds if a job is currently active
        const startWait = Date.now();
        while (isJobActive && Date.now() - startWait < 25000) {
            actionLogger.info('[MTMS-WORKER] Waiting for active job to complete...');
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await closeBrowser().catch(() => {});
        await redis.del(WORKER_HEARTBEAT_KEY).catch(() => {});
        await queueRedis.quit().catch(() => {});
        await redis.quit().catch(() => {});
        actionLogger.info('[MTMS-WORKER] Clean shutdown complete.');
    } catch (err) {
        actionLogger.error(
            '[MTMS-WORKER] Error during shutdown:',
            err instanceof Error ? err : new Error(String(err))
        );
    } finally {
        process.exit(0);
    }
};

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
