'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { redis } from '@/lib/redis';
import type { ScraperAction } from '@/lib/repositories/scraper-log.repository';
import {
    executeWOLensaScraping,
    type ScrapedWODetailMaterial,
    type ScrapedWODetailResult,
    scrapeSingleWODetailService,
    type WOLensaScrapeOutcome,
} from '@/lib/services/lensa-wo-service';
import { dispatchWorkerJob, isWorkerActive } from '@/lib/workers/worker-client';

export type { ScrapedWODetailMaterial, ScrapedWODetailResult };

/**
 * Trigger internal scraping WO Lensa.
 * Delegated to executeWOLensaScraping in @/lib/services/lensa-wo-service.
 */
export async function internalTriggerWOScraping(
    perpage?: number,
    fullLoop: boolean = false,
    action: ScraperAction = 'system'
): Promise<WOLensaScrapeOutcome> {
    return executeWOLensaScraping(perpage, fullLoop, action);
}

/**
 * Trigger background scraping WO Lensa.
 * Dispatches to standalone worker if active, or runs in-process fallback.
 */
export async function triggerWOScraping(): Promise<
    { success: true; jobId: string } | { success: false; error: string }
> {
    const jobId = `wo_lensa_scrape_${Date.now()}`;

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
            type: 'scrape:wo-lensa',
            fullLoop: true,
            createdAt: Date.now(),
        });
        if (!dispatched) {
            return { success: false, error: 'Gagal mendispatch job ke background worker.' };
        }
        return { success: true, jobId };
    }

    // Fallback: in-process background worker
    await redis.set(`job:${jobId}`, JSON.stringify({ status: 'running' }));
    Promise.resolve().then(async () => {
        try {
            const result = await internalTriggerWOScraping(undefined, true, 'manual');
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
                    JSON.stringify({ status: 'error', error: result.message }),
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
        }
    });

    return { success: true, jobId };
}

/**
 * Check WO scraping job status
 */
export async function checkWOScrapingStatus(jobId: string) {
    const data = await redis.get(`job:${jobId}`);
    if (!data) return { status: 'not_found' };

    const parsed = JSON.parse(data);
    if (parsed.status === 'success') {
        revalidatePath('/reference/wo-lensa-ref');
        revalidatePath('/form/rekon-lensa');
    }
    return parsed;
}

/**
 * Scrape single WO detail on demand
 */
export async function scrapeSingleWODetail(idOrWoInput: string): Promise<{
    success: boolean;
    data?: ScrapedWODetailResult;
    error?: string;
}> {
    try {
        const parsed = z
            .string()
            .trim()
            .min(1, 'Pemakaian ID atau Nomor WO wajib diisi')
            .safeParse(idOrWoInput);
        if (!parsed.success) {
            return {
                success: false,
                error: parsed.error.issues[0]?.message ?? 'ID tidak valid',
            };
        }

        const input = parsed.data;

        // Otorisasi server action (AGENTS.md §1.1)
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
                error: 'Hanya non-staff yang dapat melakukan scraping detail WO Lensa langsung',
            };
        }

        return scrapeSingleWODetailService(input, sessionUser.nik);
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Terjadi kesalahan sistem',
        };
    }
}
