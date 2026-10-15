export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    // Cron jobs only run in production (pnpm start).
    // In development (pnpm dev), skip registration to avoid running
    // scrapers on the dev machine and to keep dev startup fast.
    if (process.env.NODE_ENV !== 'production') return;

    const cron = await import('node-cron');
    const { actionLogger } = await import('@/lib/logger');
    const { internalTriggerScraping } = await import(
        './app/(DashboardLayout)/apps/out-lensa-ref/_actions/out-lensa-actions'
    );
    const { internalTriggerWOScraping } = await import(
        './app/(DashboardLayout)/apps/wo-lensa-ref/_actions/wo-lensa-actions'
    );
    const { syncOtherStock } = await import('@/lib/google_ecosystem/sheets-stock-sync');

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

    // Prevent multiple cron registrations in development (hot reload)
    const globalAny = global as any;
    if (!globalAny.__cronRegistered) {
        globalAny.__cronRegistered = true;

        for (const schedule of schedules) {
            cron.schedule(schedule.time, () => runScrapers(schedule.perpage), {
                timezone: 'Asia/Jakarta',
            });
        }

        // Daily Google Sheets → JSON cache sync at 09:00 WIB.
        // Tab DATA KEMARIN is updated by the external team each morning, so
        // 09:00 WIB is the earliest reliable time to pull fresh data.
        cron.schedule('0 9 * * *', () => syncOtherStock(), {
            timezone: 'Asia/Jakarta',
        });

        actionLogger.info('[CRON] Scheduled Lensa scrapers registered for Asia/Jakarta timezone.');
        actionLogger.info('[CRON] Scheduled Sheets other-stock sync at 09:00 WIB.');

        // ── Startup sync ──────────────────────────────────────────────────────
        // Run an immediate sync on server start so data is available right away,
        // even if the server restarts after 09:00 or is freshly deployed.
        // Runs in the background — does not block startup.
        actionLogger.info('[STARTUP] Triggering initial Sheets other-stock sync in background…');
        syncOtherStock().catch((err: unknown) => {
            actionLogger.error(
                '[STARTUP] Initial Sheets other-stock sync failed:',
                err instanceof Error ? err : new Error(String(err))
            );
        });
    }
}
