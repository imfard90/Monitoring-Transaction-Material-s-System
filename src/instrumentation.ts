export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    // Cron jobs only run in production (pnpm start).
    // In development (pnpm dev), skip registration to avoid running
    // scrapers on the dev machine and to keep dev startup fast.
    if (process.env.NODE_ENV !== 'production') return;

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
            await internalTriggerScraping(perpage);
            actionLogger.info(`[CRON] Lensa scrapers perpage=${perpage} completed.`);
            actionLogger.info(`[CRON] Running WO Lensa scrapers (v3 internal perpage)...`);
            await internalTriggerWOScraping();
            actionLogger.info(`[CRON] WO Lensa scrapers completed.`);
        } catch (error) {
            actionLogger.error(
                '[CRON] Error during scheduled scraping:',
                error instanceof Error ? error : new Error(String(error))
            );
        }
    };

    // Bulk Technician Stock Scraper Schedules (Intech Lensa vs MTMS):
    // 1. 00:30 WIB
    // 2. 05:00 WIB
    // 3. 11:00 WIB
    // 4. 19:00 WIB
    // 5. 22:00 WIB
    const stockScrapeSchedules = [
        { time: '30 0 * * *', label: '00:30 WIB' },
        { time: '0 5 * * *', label: '05:00 WIB' },
        { time: '0 11 * * *', label: '11:00 WIB' },
        { time: '0 19 * * *', label: '19:00 WIB' },
        { time: '0 22 * * *', label: '22:00 WIB' },
    ];

    const runBulkStockScraper = async (label: string) => {
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
            actionLogger.info(
                `[CRON] Bulk technician stock scraping (${label}) completed: ${result.success} succeeded, ${result.failed} failed of ${result.total}.`
            );
        } catch (error) {
            actionLogger.error(
                `[CRON] Error during bulk stock scraping (${label}):`,
                error instanceof Error ? error : new Error(String(error))
            );
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

        const runWithRetry = async (context: string, maxAttempts = 3): Promise<void> => {
            const delaysMs = [30_000, 60_000];
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const completed = await runLockedStockSync(context);
                    if (!completed) throw new Error('Another stock sync currently holds the lock.');
                    actionLogger.info(
                        `[${context}] Sheets stock sync succeeded (attempt ${attempt}/${maxAttempts}).`
                    );
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
        };

        const runScheduledStockSync = (scheduleLabel: string) =>
            runWithRetry(`CRON ${scheduleLabel}`).catch((err: unknown) => {
                actionLogger.error(
                    `[CRON] Sheets other-stock sync (${scheduleLabel}) failed:`,
                    err instanceof Error ? err : new Error(String(err))
                );
            });

        cron.schedule('0 9 * * *', () => runScheduledStockSync('09:00'), {
            timezone: 'Asia/Jakarta',
        });
        cron.schedule('0 14 * * *', () => runScheduledStockSync('14:00 fallback'), {
            timezone: 'Asia/Jakarta',
        });

        actionLogger.info('[CRON] Scheduled Lensa scrapers registered for Asia/Jakarta timezone.');
        actionLogger.info(
            '[CRON] Scheduled Sheets other-stock sync at 09:00 WIB and 14:00 WIB fallback.'
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
            '[CRON] Scheduled bulk technician stock scrapers at 00:30, 05:00, 11:00, 19:00, 22:00 WIB (Asia/Jakarta).'
        );

        // Startup sync uses the same retry and lock policy as scheduled syncs.
        actionLogger.info(
            '[STARTUP] Triggering initial Sheets other-stock sync with retry in background…'
        );
        void runWithRetry('STARTUP');
    }
}
