'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { scrapeReservation } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import type { ScraperAction } from '@/lib/repositories/scraper-log.repository';
import { decryptLensaPassword } from '@/lib/services/lensa-crypto';
import {
    executeOutLensaScraping,
    type OutLensaScrapeOutcome,
    type ScrapedOutLensaDetailMaterial,
    type ScrapedOutLensaDetailResult,
    scrapeSingleOutLensaDetailService,
} from '@/lib/services/lensa-out-service';
import { dispatchWorkerJob, isWorkerActive } from '@/lib/workers/worker-client';

export type { ScrapedOutLensaDetailMaterial, ScrapedOutLensaDetailResult };

/**
 * Trigger internal scraping Out Lensa.
 * Delegated to executeOutLensaScraping in @/lib/services/lensa-out-service.
 */
export async function internalTriggerScraping(
    perpage: number = 20,
    action: ScraperAction = 'system'
): Promise<OutLensaScrapeOutcome> {
    return executeOutLensaScraping(perpage, action);
}

/**
 * Trigger background scraping Out Lensa.
 * Dispatches to standalone worker if active, or runs in-process fallback.
 */
export async function triggerScraping(): Promise<
    { success: true; jobId: string } | { success: false; error: string }
> {
    const LOCK_KEY = 'lock:out_lensa_scrape';
    const LOCK_TTL = 1800; // 30 menit

    // Acquire active-job lock (atomic SET NX) untuk mencegah manual/cron overlap
    const acquired = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX');
    if (!acquired) {
        return {
            success: false,
            error: 'Scrape sedang berjalan (manual/cron overlap). Coba lagi nanti.',
        };
    }

    const jobId = `out_lensa_scrape_${Date.now()}`;

    // If standalone background worker is running, delegate execution to worker
    const workerActive = await isWorkerActive();
    if (workerActive) {
        await redis.set(
            `job:${jobId}`,
            JSON.stringify({
                status: 'queued',
                message: 'Job scraping masuk ke antrean worker...',
            }),
            'EX',
            3600
        );
        const dispatched = await dispatchWorkerJob({
            id: jobId,
            type: 'scrape:out-lensa',
            createdAt: Date.now(),
        });
        if (!dispatched) {
            await redis.del(LOCK_KEY);
            return { success: false, error: 'Gagal mendispatch job ke background worker.' };
        }
        return { success: true, jobId };
    }

    // Fallback: in-process background worker
    await redis.set(`job:${jobId}`, JSON.stringify({ status: 'running' }));
    Promise.resolve().then(async () => {
        try {
            const result = await internalTriggerScraping(20, 'manual');
            if (result.success) {
                await redis.set(
                    `job:${jobId}`,
                    JSON.stringify({ status: 'success', data: result }),
                    'EX',
                    3600
                );
            } else {
                await redis.set(
                    `job:${jobId}`,
                    JSON.stringify({ status: 'error', error: result.error }),
                    'EX',
                    3600
                );
            }
        } catch (error: unknown) {
            await redis.set(
                `job:${jobId}`,
                JSON.stringify({
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                }),
                'EX',
                3600
            );
        } finally {
            await redis.del(LOCK_KEY);
        }
    });

    return { success: true, jobId };
}

/**
 * Scrape individual reservation details for Out Sap Form
 */
export async function scrapeReservationAction(id: string) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        let customUsername = '';
        let customPassword = '';

        if (session?.user?.id) {
            const userObj = await db
                .selectFrom('auth.user')
                .select(['lensa_acount'])
                .where('id', '=', session.user.id)
                .executeTakeFirst();

            if (userObj?.lensa_acount) {
                const account = userObj.lensa_acount as any;
                customUsername = account.username;
                try {
                    customPassword = decryptLensaPassword(account.password);
                } catch (e) {
                    actionLogger.error(
                        'Failed to decrypt user password',
                        e instanceof Error ? e : new Error(String(e))
                    );
                }
            }
        }

        const result = await scrapeReservation(id, customUsername, customPassword);
        return result;
    } catch (error: unknown) {
        return { error: error instanceof Error ? error.message : 'Terjadi kesalahan sistem' };
    }
}

/**
 * Scrape single Out Lensa detail on demand
 */
export async function scrapeSingleOutLensaDetail(reservationIdInput: string): Promise<{
    success: boolean;
    data?: ScrapedOutLensaDetailResult;
    error?: string;
}> {
    const parsed = z
        .string()
        .trim()
        .min(1, 'Reservation ID wajib diisi')
        .safeParse(reservationIdInput);
    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message ?? 'ID tidak valid',
        };
    }

    const sessionUser = await getSessionUser();
    if (!sessionUser) {
        return {
            success: false,
            error: 'Sesi kedaluwarsa. Silakan login kembali.',
        };
    }
    if (sessionUser.isStaff) {
        return {
            success: false,
            error: 'Hanya non-staff yang dapat melakukan scraping detail Out Lensa langsung',
        };
    }

    return scrapeSingleOutLensaDetailService(parsed.data, sessionUser.nik);
}
