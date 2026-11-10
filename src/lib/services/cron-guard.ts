import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

export const CRON_RUNNING_KEY = 'scraper:cron_running';
export const CRON_RUNNING_TTL_SECONDS = 1800; // 30 minutes safeguard TTL

export interface CronRunningStatus {
    type: 'out_lensa' | 'wo_lensa' | 'bulk_stock' | 'wo_lensa_nightly';
    label: string;
    startedAt: number;
}

/**
 * Marks that a scheduled scraping cronjob is actively executing.
 */
export async function setCronRunning(
    type: CronRunningStatus['type'],
    label: string
): Promise<void> {
    try {
        const payload: CronRunningStatus = {
            type,
            label,
            startedAt: Date.now(),
        };
        await redis.set(CRON_RUNNING_KEY, JSON.stringify(payload), 'EX', CRON_RUNNING_TTL_SECONDS);
        actionLogger.info(`[CRON-GUARD] Status cron active di-set: ${type} (${label})`);
    } catch (err) {
        actionLogger.warn('[CRON-GUARD] Gagal set status cron active ke Redis:', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Clears the active cronjob indicator upon completion or failure.
 */
export async function clearCronRunning(): Promise<void> {
    try {
        await redis.del(CRON_RUNNING_KEY);
        actionLogger.info('[CRON-GUARD] Status cron active dibersihkan.');
    } catch (err) {
        actionLogger.warn('[CRON-GUARD] Gagal clear status cron active di Redis:', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Retrieves the currently active cron status, or null if none is running.
 */
export async function getCronRunningStatus(): Promise<CronRunningStatus | null> {
    try {
        const data = await redis.get(CRON_RUNNING_KEY);
        if (!data) return null;
        return JSON.parse(data) as CronRunningStatus;
    } catch {
        return null;
    }
}

/**
 * Checks whether any cronjob is currently active.
 */
export async function isCronRunning(): Promise<boolean> {
    const status = await getCronRunningStatus();
    return status !== null;
}

