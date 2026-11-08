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
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';

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
        const cleanId = (id || '').trim();
        if (!cleanId) {
            return { error: 'Masukkan Request ID terlebih dahulu' };
        }

        // 1. Cek apakah reservasi sudah ada di database (out_lensa_ref_header & out_lensa_ref_list)
        const headerInDb = await db
            .selectFrom('inventory.out_lensa_ref_header as h')
            .selectAll()
            .where((eb) =>
                eb.or([
                    eb('h.reservation_id', '=', cleanId),
                    eb('h.reservation_id_sap', '=', cleanId),
                ])
            )
            .executeTakeFirst();

        if (headerInDb) {
            const detailRows = await db
                .selectFrom('inventory.out_lensa_ref_list')
                .selectAll()
                .where('header_id', '=', headerInDb.id)
                .execute();

            if (detailRows.length > 0) {
                return {
                    listData: {
                        data: [
                            {
                                reservation_id_sap: headerInDb.reservation_id_sap || '',
                                gi_number: headerInDb.gi_number || '',
                                nama_gudang: headerInDb.nama_gudang || '',
                            },
                        ],
                    },
                    detailContent: {
                        headerInfo: {
                            nikPemakai: headerInDb.nik_pemakai || '',
                        },
                        materials: detailRows.map((d) => ({
                            'ID MATERIAL': d.material_id || '',
                            'QTY ACCEPTED': String(d.qty_approve || 0),
                        })),
                    },
                };
            }
        }

        // 2. Resolusi kredensial Lensa: cek PIC gudang 1 failback PIC gudang 2
        const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
        const sessionUser = await getSessionUser().catch(() => null);
        const userId = session?.user?.id;
        const nik = sessionUser?.nik ?? (session?.user as { nik?: string } | undefined)?.nik;
        let customUsername = '';
        let customPassword = '';

        // Tentukan gudang target
        let targetWh: { id: number; name: string; pic_1: string | null; pic_2: string | null } | null = null;
        if (headerInDb?.nama_gudang) {
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select(['id', 'name', 'pic_1', 'pic_2'])
                .execute();
            targetWh = findMatchingMasterWarehouse(headerInDb.nama_gudang, whs) || null;
        }

        if (!targetWh && sessionUser?.warehouseIds?.[0]) {
            targetWh =
                (await db
                    .selectFrom('inventory.mas_wh')
                    .select(['id', 'name', 'pic_1', 'pic_2'])
                    .where('id', '=', sessionUser.warehouseIds[0])
                    .executeTakeFirst()) || null;
        }

        // Cek PIC 1 lalu fallback PIC 2 dari gudang tersebut
        if (targetWh) {
            for (const picNik of [targetWh.pic_1, targetWh.pic_2]) {
                if (!picNik) continue;
                const picUser = await db
                    .selectFrom('auth.user')
                    .select(['lensa_acount'])
                    .where('nik', '=', picNik)
                    .executeTakeFirst();
                if (picUser?.lensa_acount?.username && picUser?.lensa_acount?.password) {
                    try {
                        const pass = decryptLensaPassword(picUser.lensa_acount.password);
                        if (pass) {
                            customUsername = picUser.lensa_acount.username;
                            customPassword = pass;
                            break;
                        }
                    } catch (e) {
                        actionLogger.warn(
                            `Failed to decrypt Lensa password for PIC ${picNik}`,
                            { error: e instanceof Error ? e.message : String(e) }
                        );
                    }
                }
            }
        }

        // Fallback 1: cek profil user yang sedang login (jika user bersangkutan menghubungkan akun)
        if (!customUsername || !customPassword) {
            let userObj = null;
            if (userId) {
                userObj = await db
                    .selectFrom('auth.user')
                    .select(['lensa_acount'])
                    .where('id', '=', userId)
                    .executeTakeFirst();
            }
            if (!userObj?.lensa_acount && nik) {
                userObj = await db
                    .selectFrom('auth.user')
                    .select(['lensa_acount'])
                    .where('nik', '=', nik)
                    .executeTakeFirst();
            }

            if (userObj?.lensa_acount?.username && userObj?.lensa_acount?.password) {
                customUsername = userObj.lensa_acount.username;
                try {
                    customPassword = decryptLensaPassword(userObj.lensa_acount.password);
                } catch (e) {
                    actionLogger.error(
                        'Failed to decrypt user password',
                        e instanceof Error ? e : new Error(String(e))
                    );
                }
            }
        }

        // Fallback 2: cek sembarang akun Lensa aktif di sistem
        if (!customUsername || !customPassword) {
            const anyLensaUsers = await db
                .selectFrom('auth.user')
                .select(['lensa_acount'])
                .where('lensa_acount', 'is not', null)
                .execute();

            for (const u of anyLensaUsers) {
                if (u.lensa_acount?.username && u.lensa_acount?.password) {
                    try {
                        const pass = decryptLensaPassword(u.lensa_acount.password);
                        if (pass) {
                            customUsername = u.lensa_acount.username;
                            customPassword = pass;
                            break;
                        }
                    } catch {}
                }
            }
        }

        const result = await scrapeReservation(cleanId, customUsername, customPassword);
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
