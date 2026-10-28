export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    // Cron jobs only run in production (pnpm start).
    // In development (pnpm dev), skip registration to avoid running
    // scrapers on the dev machine and to keep dev startup fast.
    if (process.env.NODE_ENV !== 'production') return;

    // By default in production with isolated worker, we do NOT run embedded cron in Next.js web server.
    // Only run if RUN_EMBEDDED_CRON is explicitly set to 'true'.
    if (process.env.RUN_EMBEDDED_CRON !== 'true') {
        const { actionLogger } = await import('@/lib/logger');
        actionLogger.info(
            '[INSTRUMENTATION] Embedded cron in Next.js web process is disabled (RUN_EMBEDDED_CRON !== true). Background tasks are isolated in mtms-worker.'
        );
        return;
    }

    const cron = await import('node-cron');
    const { actionLogger } = await import('@/lib/logger');
    const { internalTriggerScraping } = await import(
        './app/(DashboardLayout)/reference/out-lensa-ref/_actions/out-lensa-actions'
    );
    const { internalTriggerWOScraping } = await import(
        './app/(DashboardLayout)/reference/wo-lensa-ref/_actions/wo-lensa-actions'
    );
    const { bulkScrapeStockTeknisi } = await import('@/lib/services/bulk-stock-scraper');
    const { closeBrowser } = await import('@/lib/lensa-scraper/lensa-scraper');
    const { OTHER_STOCK_SYNC_LOCK_KEY, OTHER_STOCK_SYNC_LOCK_TTL_SECONDS, syncOtherStock } =
        await import('@/lib/google_ecosystem/sheets-stock-sync');
    const { redis } = await import('@/lib/redis');
    const { scraperLogRepository } = await import('@/lib/repositories/scraper-log.repository');

    // Schedule: 04.00, 09.30, 12.30, 15.00, 18.00, 21.00, 23.00 WIB
    // WIB is UTC+7.
    // 04:00 WIB = 21:00 UTC (previous day)
    // 09:30 WIB = 02:30 UTC
    // 12:30 WIB = 05:30 UTC
    // 15:00 WIB = 08:00 UTC
    // 18:00 WIB = 11:00 UTC
    // 21:00 WIB = 14:00 UTC
    // 23:00 WIB = 16:00 UTC

    // We can use timezone option in node-cron to specify 'Asia/Jakarta'
    // so we don't convert to UTC manually.

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
            await internalTriggerScraping(perpage, 'system');
            actionLogger.info(`[CRON] Lensa scrapers perpage=${perpage} completed.`);
            actionLogger.info('[CRON] Running WO Lensa scrapers...');
            await internalTriggerWOScraping(undefined, undefined, 'system');
            actionLogger.info('[CRON] WO Lensa scrapers completed.');
        } catch (error) {
            actionLogger.error(
                '[CRON] Error during scheduled scraping:',
                error instanceof Error ? error : new Error(String(error))
            );
        }
    };

    // Bulk Technician Stock Scraper Schedules (Intech Lensa vs MTMS):
    // 1. 06:30 WIB
    // 2. 10:00 WIB
    // 3. 13:00 WIB
    // 4. 16:00 WIB
    // 5. 18:30 WIB
    // 6. 21:30 WIB
    // 7. 23:30 WIB
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
        const LOCK_TTL = 1800; // 30 menit TTL

        try {
            // Atomic Redis lock prevent overlap with manual scraper or another cron job
            const acquired = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX');
            if (!acquired) {
                actionLogger.warn(
                    `[CRON] Bulk stock scraping (${label}) skipped; another scraping job is running.`
                );
                return;
            }

            actionLogger.info(`[CRON] Starting bulk technician stock scraping (${label})...`);
            const result = await bulkScrapeStockTeknisi();
            const resume = `${result.success} sukses, ${result.failed} gagal dari ${result.total} teknisi (${label})`;
            actionLogger.info(
                `[CRON] Bulk technician stock scraping (${label}) completed: ${resume}`
            );
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
            await redis.del(LOCK_KEY);
            await closeBrowser().catch(() => {});
        }
    };

    // Prevent multiple cron registrations in development (hot reload)
    const globalAny = global as any;
    if (!globalAny.__cronRegistered) {
        globalAny.__cronRegistered = true;

        for (const schedule of schedules) {
            cron.schedule(schedule.time, () => runScrapers(schedule.perpage), {
                timezone: 'Asia/Jakarta',
            });
        }

        // Daily Google Sheets → JSON cache sync at 09:00 WIB and fallback at 14:00.
        // Tab DATA KEMARIN is updated by the external team each morning.
        const runLockedStockSync = async (context: string): Promise<boolean> => {
            const lockToken = globalThis.crypto.randomUUID();
            const acquired = await redis.set(
                OTHER_STOCK_SYNC_LOCK_KEY,
                lockToken,
                'EX',
                OTHER_STOCK_SYNC_LOCK_TTL_SECONDS,
                'NX'
            );
            if (!acquired) {
                actionLogger.warn(
                    `[${context}] Sheets stock sync skipped; another sync is running.`
                );
                return false;
            }

            try {
                await syncOtherStock();
                return true;
            } finally {
                await redis.eval(
                    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                    1,
                    OTHER_STOCK_SYNC_LOCK_KEY,
                    lockToken
                );
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
                        actionLogger.info(
                            `[${context}] Retrying Sheets stock sync in ${delayMs / 1000}s.`
                        );
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

        const runScheduledStockSync = (scheduleLabel: string) =>
            runWithRetry(`CRON ${scheduleLabel}`, 3, 'system').catch((err: unknown) => {
                actionLogger.error(
                    `[CRON] Sheets other-stock sync (${scheduleLabel}) failed:`,
                    err instanceof Error ? err : new Error(String(err))
                );
            });

        for (const schedule of otherStockSchedules) {
            cron.schedule(schedule.time, () => runScheduledStockSync(schedule.label), {
                timezone: 'Asia/Jakarta',
            });
        }

        actionLogger.info('[CRON] Scheduled Lensa scrapers registered for Asia/Jakarta timezone.');
        actionLogger.info(
            '[CRON] Scheduled Sheets other-stock sync at 05:00, 10:00, 13:00, 17:00, 20:00 WIB (Asia/Jakarta).'
        );

        for (const schedule of stockScrapeSchedules) {
            cron.schedule(
                schedule.time,
                () => {
                    void runBulkStockScraper(schedule.label);
                },
                {
                    timezone: 'Asia/Jakarta',
                }
            );
        }
        actionLogger.info(
            '[CRON] Scheduled bulk technician stock scrapers at 06:30, 10:00, 13:00, 16:00, 18:30, 21:30, 23:30 WIB (Asia/Jakarta).'
        );

        // Startup sync uses the same retry and lock policy as scheduled syncs.
        actionLogger.info(
            '[STARTUP] Triggering initial Sheets other-stock sync with retry in background…'
        );
        void runWithRetry('STARTUP');
    }
}
