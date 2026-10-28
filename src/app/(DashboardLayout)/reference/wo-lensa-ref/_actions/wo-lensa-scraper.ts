'use server';

import crypto from 'node:crypto';
import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/db';
import { scrapeWOLensaDetails, scrapeWOLensaHeaders } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { resolveMaterialAlias } from '@/lib/material-alias-helper';
import { redis } from '@/lib/redis';
import {
    type ScraperAction,
    scraperLogRepository,
} from '@/lib/repositories/scraper-log.repository';
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';
import { dispatchWorkerJob, isWorkerActive } from '@/lib/workers/worker-client';

const getEncryptionKey = () => {
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('MFA_ENCRYPTION_SECRET is not set');
    }
    // Hash the secret to guarantee exactly 32 bytes of high entropy for AES-256
    return crypto.createHash('sha256').update(secret).digest();
};

function decrypt(text: string) {
    if (!text) return '';
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) throw new Error('MFA_ENCRYPTION_SECRET is not set');

    try {
        const textParts = text.split(':');
        const firstPart = textParts.shift();
        if (!firstPart) throw new Error('Invalid encrypted text format');
        const iv = Buffer.from(firstPart, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');

        // Primary: strict SHA-256 derived key (P3-S6)
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        } catch (_primaryErr) {
            // Fallback for legacy passwords encrypted with slice(0, 32) before P3-S6
            const keyLegacy = Buffer.from(secret.slice(0, 32));
            const decipher = crypto.createDecipheriv('aes-256-cbc', keyLegacy, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        }
    } catch (_e) {
        throw new Error('Failed to decrypt password');
    }
}

async function asyncPool<T, R>(
    poolLimit: number,
    array: T[],
    iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
    const ret: Promise<R>[] = [];
    const executing: Promise<void>[] = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);

        if (poolLimit <= array.length) {
            const e: Promise<void> = p.then(() => {
                executing.splice(executing.indexOf(e), 1);
            });
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

export async function internalTriggerWOScraping(
    _perpage?: number,
    _fullLoop: boolean = false,
    action: ScraperAction = 'system'
) {
    // v3: ukuran halaman ditentukan internal scraper (default 100).
    // Parameter _perpage diabaikan agar perubahan jadwal Out Lensa tidak memengaruhi WO.
    const perpage = 100;
    try {
        // 1) Kumpulkan warehouse + PIC 1/PIC 2 + mapping NIK → user lensa
        const whs = await db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'pic_1', 'pic_2'])
            .execute();

        const usersWithLensa = await db
            .selectFrom('auth.user as u')
            .where('u.lensa_acount', 'is not', null)
            .select(['u.id', 'u.nik', 'u.lensa_acount'])
            .execute();

        const userByNik = new Map<string, (typeof usersWithLensa)[number]>();
        for (const u of usersWithLensa) {
            if (u.nik) userByNik.set(u.nik, u);
        }

        // 2) Existing pemakaian_id untuk dedup
        const existingHeaders = await db
            .selectFrom('inventory.wo_lensa_header')
            .select(['pemakaian_id'])
            .execute();
        const existingPemakaianIds = existingHeaders.map((h) => String(h.pemakaian_id));

        let totalInserted = 0;

        // 3) Per-warehouse: PIC 1 → fallback PIC 2
        const whTasks = whs
            .map((w) => {
                const pic1Nik = w.pic_1 ? String(w.pic_1).trim() : null;
                const pic2Nik = w.pic_2 ? String(w.pic_2).trim() : null;
                const pic1 = pic1Nik ? userByNik.get(pic1Nik) : undefined;
                const pic2 = pic2Nik ? userByNik.get(pic2Nik) : undefined;
                if (!pic1?.lensa_acount && !pic2?.lensa_acount) return null;
                return {
                    wh: w,
                    pic1: pic1?.lensa_acount ? pic1 : undefined,
                    pic2: pic2?.lensa_acount ? pic2 : undefined,
                };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);

        if (whTasks.length === 0) {
            return {
                success: false,
                message:
                    'Tidak ada warehouse dengan PIC Lensa yang valid untuk melakukan scraping.',
            };
        }

        const headerResults = await asyncPool(5, whTasks, async (task) => {
            const candidates = [task.pic1, task.pic2].filter(Boolean) as NonNullable<
                (typeof whTasks)[number]['pic1']
            >[];
            if (candidates.length === 0) return [];

            for (const picUser of candidates) {
                const lensaAcount = picUser.lensa_acount as Record<string, string> | null;
                if (!lensaAcount?.username || !lensaAcount?.password) continue;

                const customUsername = lensaAcount.username;
                let customPassword = '';
                try {
                    customPassword = decrypt(lensaAcount.password);
                } catch (_e) {
                    actionLogger.error(`Failed to decrypt password for user ${picUser.id}`);
                    continue;
                }

                try {
                    const newHeaders = await scrapeWOLensaHeaders(
                        existingPemakaianIds,
                        customUsername,
                        customPassword,
                        perpage
                    );
                    actionLogger.info(
                        `[WO][${task.wh.name}] PIC ${customUsername} → ${newHeaders.length} headers`
                    );
                    return newHeaders;
                } catch (e: unknown) {
                    actionLogger.error(
                        `[WO][${task.wh.name}] Failed scrape PIC ${customUsername}: ${
                            e instanceof Error ? e.message : e
                        } — trying fallback`
                    );
                    // lanjut ke kandidat berikutnya (PIC 2)
                }
            }

            actionLogger.info(`[WO][${task.wh.name}] Semua PIC gagal.`);
            return [];
        });

        const allNewHeaders = headerResults.flat();

        // Filter out headers with "REJECTED" in wo_number — these are cancelled/not-used orders
        const filteredHeaders = allNewHeaders.filter(
            (h) => !h.wo_number?.toUpperCase().includes('REJECTED')
        );

        const uniqueHeadersMap = new Map<string, (typeof filteredHeaders)[number]>();
        for (const h of filteredHeaders) {
            uniqueHeadersMap.set(h.pemakaian_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        // Backfill GI numbers only for existing headers that currently have no GI number.
        const rowsWithGi = deduplicatedHeaders.filter(
            (header) =>
                existingPemakaianIds.includes(String(header.pemakaian_id)) &&
                header.gi_number != null &&
                String(header.gi_number).trim() !== ''
        );

        for (let index = 0; index < rowsWithGi.length; index += 200) {
            const batch = rowsWithGi.slice(index, index + 200);
            await db.transaction().execute(async (trx) => {
                await sql`
                    UPDATE inventory.wo_lensa_header AS header
                    SET gi_number = updates.gi_number
                    FROM (${sql.join(
                        batch.map(
                            (header) =>
                                sql`(${Number(header.pemakaian_id)}, ${String(header.gi_number)})`
                        ),
                        sql`, `
                    )}) AS updates(pemakaian_id, gi_number)
                    WHERE header.pemakaian_id = updates.pemakaian_id
                      AND header.gi_number IS NULL
                `.execute(trx);
            });
        }

        if (deduplicatedHeaders.length > 0) {
            // Pre-check for rekon_check before saving
            const pemakaianIds = deduplicatedHeaders
                .map((h: any) => (h.pemakaian_id ? String(h.pemakaian_id).trim() : ''))
                .filter(Boolean);
            const woNumbers = deduplicatedHeaders
                .map((h: any) => (h.wo_number ? String(h.wo_number).trim() : ''))
                .filter(Boolean);

            const matchedPemakaianIds = new Set<string>();
            const matchedWoNumbers = new Set<string>();

            if (pemakaianIds.length > 0 || woNumbers.length > 0) {
                let rekonQuery = db
                    .selectFrom('inventory.rekon_used_header')
                    .select(['id_pemakaian', 'wo_number']);

                if (pemakaianIds.length > 0 && woNumbers.length > 0) {
                    rekonQuery = rekonQuery.where((eb) =>
                        eb.or([
                            eb('id_pemakaian', 'in', pemakaianIds),
                            eb('wo_number', 'in', woNumbers),
                        ])
                    );
                } else if (pemakaianIds.length > 0) {
                    rekonQuery = rekonQuery.where('id_pemakaian', 'in', pemakaianIds);
                } else {
                    rekonQuery = rekonQuery.where('wo_number', 'in', woNumbers);
                }

                const existingRekon = await rekonQuery.execute();
                for (const r of existingRekon) {
                    if (r.id_pemakaian?.trim()) matchedPemakaianIds.add(r.id_pemakaian.trim());
                    if (r.wo_number?.trim()) matchedWoNumbers.add(r.wo_number.trim());
                }
            }

            await db.transaction().execute(async (trx) => {
                for (const h of deduplicatedHeaders) {
                    const pId = h.pemakaian_id ? String(h.pemakaian_id).trim() : '';
                    const wo = h.wo_number ? String(h.wo_number).trim() : '';
                    const isRekonCheck =
                        (Boolean(pId) && matchedPemakaianIds.has(pId)) ||
                        (Boolean(wo) && matchedWoNumbers.has(wo));

                    await trx
                        .insertInto('inventory.wo_lensa_header')
                        .values({
                            pemakaian_id: h.pemakaian_id,
                            gi_number: h.gi_number,
                            nama_gudang: h.nama_gudang,
                            nik_pemakai: h.nik_pemakai,
                            tanggal_update: h.tanggal_update,
                            formatted_date: h.formatted_date,
                            type: h.type,
                            wbs: h.wbs,
                            wo_number: h.wo_number,
                            rekon_check: isRekonCheck,
                        } as any)
                        .execute();
                    totalInserted++;
                    existingPemakaianIds.push(String(h.pemakaian_id));
                }
            });
        }

        // PHASE 2: SCRAPE DETAILS
        const headersMissingDetails = await db
            .selectFrom('inventory.wo_lensa_header as h')
            .leftJoin('inventory.wo_lensa_list as l', 'l.header_id', 'h.id')
            .select(['h.id', 'h.pemakaian_id', 'h.nama_gudang', 'h.type'])
            .where('l.id', 'is', null)
            .execute();

        if (headersMissingDetails.length > 0) {
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select(['name', 'pic_1', 'pic_2'])
                .execute();
            const usersWithLensa = await db
                .selectFrom('auth.user as u')
                .where('u.lensa_acount', 'is not', null)
                .select(['u.nik', 'u.lensa_acount'])
                .execute();

            const groupedHeaders: Record<string, typeof headersMissingDetails> = {};
            for (const h of headersMissingDetails) {
                const gudang = h.nama_gudang || 'UNKNOWN';
                if (!groupedHeaders[gudang]) groupedHeaders[gudang] = [];
                groupedHeaders[gudang].push(h);
            }

            const tasks = Object.keys(groupedHeaders)
                .map((gudang) => {
                    const wh = findMatchingMasterWarehouse(gudang, whs);
                    if (!wh) return null;
                    const picNik = wh.pic_1 || wh.pic_2;
                    if (!picNik) return null;
                    const userObj = usersWithLensa.find((u) => u.nik === picNik);
                    if (!userObj) return null;
                    return {
                        gudang,
                        userObj,
                        headers: groupedHeaders[gudang],
                    };
                })
                .filter((t) => !!t);

            const detailResults = await asyncPool(5, tasks, async (task) => {
                const { userObj, headers } = task;
                const lensaAcount = userObj.lensa_acount as Record<string, string>;
                const customUsername = lensaAcount.username;
                let customPassword = '';
                try {
                    customPassword = decrypt(lensaAcount.password);
                } catch (_e) {
                    return [];
                }

                if (customUsername && customPassword) {
                    try {
                        return await scrapeWOLensaDetails(
                            headers.map((h) => ({
                                id: Number(h.id),
                                pemakaian_id: String(h.pemakaian_id),
                                type: (h as { type?: string | null }).type || 'assurance',
                            })),
                            customUsername,
                            customPassword
                        );
                    } catch (e: unknown) {
                        actionLogger.error(
                            `Failed to scrape details for WO gudang ${task.gudang}:`,
                            e instanceof Error ? e : new Error(String(e))
                        );
                        return [];
                    }
                }
                return [];
            });

            const allDetails = detailResults.flat();

            if (allDetails.length > 0) {
                await db.transaction().execute(async (trx) => {
                    for (const d of allDetails) {
                        if (d.materials && d.materials.length > 0) {
                            const materialInserts = d.materials.map(
                                (m: Record<string, string | number>) => {
                                    const rawMaterialId =
                                        (m['ID MATERIAL'] as string)?.trim() || null;
                                    const materialDesc = (m['NAMA MATERIAL'] as string) || null;

                                    // Fallback: Lensa kadang tidak mengirim ID MATERIAL untuk
                                    // nama material tertentu (misal "Breket / Clamp Hook").
                                    // Coba resolve via alias map sebelum menyimpan NULL.
                                    let materialId = rawMaterialId;
                                    if (!materialId && materialDesc) {
                                        const resolved = resolveMaterialAlias(materialDesc);
                                        if (resolved) {
                                            actionLogger.info(
                                                `[WO Lensa] Resolved empty material_id via alias: "${materialDesc}" → "${resolved}" (header ${d.header_id})`
                                            );
                                            materialId = resolved;
                                        } else {
                                            actionLogger.warn(
                                                `[WO Lensa] Material tanpa ID dan tidak ada alias: "${materialDesc}" (header ${d.header_id}). Tambahkan ke MATERIAL_ALIAS_MAP jika perlu.`
                                            );
                                        }
                                    }

                                    return {
                                        header_id: d.header_id,
                                        material_id: materialId,
                                        material_desc: materialDesc,
                                        uom: (m.SATUAN as string) || null,
                                        qty_pemakaian: Number(m['QTY PEMAKAIAN']) || null,
                                    };
                                }
                            );
                            await trx
                                .insertInto('inventory.wo_lensa_list')
                                .values(materialInserts)
                                .execute();
                        }
                    }
                });
            }
        }

        const resumeResult =
            totalInserted > 0
                ? `Sukses ${totalInserted} data WO baru`
                : 'Selesai: Tidak ada data WO baru';

        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: resumeResult,
            })
            .catch((err) => {
                actionLogger.warn('[WO-Lensa] Gagal mencatat scraper_cronjob_log:', err);
            });

        return {
            success: true,
            message: `Scraping selesai. ${totalInserted} data WO Lensa baru berhasil disimpan.`,
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Trigger WO scraping error:',
            error instanceof Error ? error : new Error(String(error))
        );
        const errMsg =
            error instanceof Error
                ? error.message
                : 'Terjadi kesalahan saat sinkronisasi WO Lensa.';
        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: `Gagal: ${errMsg}`,
            })
            .catch((err) => {
                actionLogger.warn('[WO-Lensa] Gagal mencatat scraper_cronjob_log:', err);
            });
        return {
            success: false,
            message: errMsg,
        };
    }
}

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

    // Fallback: in-process background worker (e.g. during local development when worker isn't running)
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
