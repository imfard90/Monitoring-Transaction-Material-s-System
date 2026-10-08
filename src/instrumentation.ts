export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const cron = await import('node-cron');
        const { internalTriggerScraping } = await import(
            './app/(DashboardLayout)/apps/out-lensa-ref/_actions/out-lensa-actions'
        );
        const { internalTriggerWOScraping } = await import(
            './app/(DashboardLayout)/apps/wo-lensa-ref/_actions/wo-lensa-actions'
        );

        // Schedule: 04.00, 09.30, 12.30, 15.00, 18.00, 21.00, 23.00 WIB
        // WIB is UTC+7.
        // 04:00 WIB = 21:00 UTC (previous day)
        // 09:30 WIB = 02:30 UTC
        // 12:30 WIB = 05:30 UTC
        // 15:00 WIB = 08:00 UTC
        // 18:00 WIB = 11:00 UTC
        // 21:00 WIB = 14:00 UTC
        // 23:00 WIB = 16:00 UTC

        // We can use the timezone option in node-cron to specify 'Asia/Jakarta'
        // so we don't have to convert to UTC manually.

        const schedules = [
            { time: '0 4 * * *', perpage: 100 }, // 04:00
            { time: '30 9 * * *', perpage: 20 }, // 09:30
            { time: '30 12 * * *', perpage: 20 }, // 12:30
            { time: '0 15 * * *', perpage: 20 }, // 15:00
            { time: '0 18 * * *', perpage: 20 }, // 18:00
            { time: '0 21 * * *', perpage: 100 }, // 21:00
            { time: '0 23 * * *', perpage: 100 }, // 23:00
        ];

        let isRunning = false;

        const runScrapers = async (perpage: number) => {
            if (isRunning) {
                console.log('[CRON] Scraper is already running, skipping this schedule.');
                return;
            }
            isRunning = true;
            try {
                console.log(`[CRON] Starting Out Lensa Scraper with perpage=${perpage}...`);
                await internalTriggerScraping(perpage);
                console.log(
                    `[CRON] Out Lensa Scraper finished. Starting WO Lensa Scraper with perpage=${perpage}...`
                );
                await internalTriggerWOScraping(perpage, true);
                console.log('[CRON] WO Lensa Scraper finished.');
            } catch (error) {
                console.error('[CRON] Error running scrapers:', error);
            } finally {
                isRunning = false;
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
            console.log('[CRON] Scheduled Lensa scrapers registered for Asia/Jakarta timezone.');
        }
    }
}
