'use server';

import crypto from 'node:crypto';
import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { redis } from '@/lib/redis';
import {
    scrapeWOLensaDetails,
    scrapeWOLensaHeaders,
} from '../../../../../../.external_scrapping/lensa-scraper';

const ENCRYPTION_KEY = (process.env.MFA_ENCRYPTION_SECRET || '').slice(0, 32);

function decrypt(text: string) {
    if (!text) return '';
    try {
        const textParts = text.split(':');
        const firstPart = textParts.shift();
        if (!firstPart) throw new Error('Invalid encrypted text format');
        const iv = Buffer.from(firstPart, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (_e) {
        throw new Error('Failed to decrypt password');
    }
}

export async function getWOLensaRefList() {
    const { isStaff, warehouseIds } = await getSessionUser();

    let whNames: string[] = [];
    if (isStaff && warehouseIds.length > 0) {
        const whs = await db
            .selectFrom('inventory.mas_wh')
            .select('name')
            .where('id', 'in', warehouseIds)
            .execute();
        whNames = whs.map((w: Record<string, unknown>) => w.name as string);
        if (whNames.includes('SO Karangpilang')) whNames.push('SO Karang Pilang');
        if (whNames.includes('SO Karang Pilang')) whNames.push('SO Karangpilang');
    }

    if (isStaff && whNames.length === 0) {
        return [];
    }

    // Auto-update rekon_check: flag WO entries that have been submitted to rekon_used_header
    await sql`
        UPDATE inventory.wo_lensa_header wlh
        SET rekon_check = TRUE
        FROM inventory.rekon_used_header ruh
        WHERE CAST(wlh.pemakaian_id AS VARCHAR) = ruh.id_pemakaian
          AND (wlh.rekon_check IS FALSE OR wlh.rekon_check IS NULL)
    `.execute(db);

    let query = db
        .selectFrom('inventory.wo_lensa_header as wlh')
        .selectAll('wlh')
        .orderBy('wlh.formatted_date', 'desc')
        .orderBy(sql<number>`CAST(wlh.pemakaian_id AS BIGINT)`, 'desc');

    if (isStaff && whNames.length > 0) {
        query = query.where('wlh.nama_gudang', 'in', whNames);
    }

    const list = await query.execute();
    return list;
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

export async function internalTriggerWOScraping(_perpage?: number, _fullLoop: boolean = false) {
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
                    console.error(`Failed to decrypt password for user ${picUser.id}`);
                    continue;
                }

                try {
                    const newHeaders = await scrapeWOLensaHeaders(
                        existingPemakaianIds,
                        customUsername,
                        customPassword,
                        perpage
                    );
                    console.warn(
                        `[WO][${task.wh.name}] PIC ${customUsername} → ${newHeaders.length} headers`
                    );
                    return newHeaders;
                } catch (e: unknown) {
                    console.error(
                        `[WO][${task.wh.name}] Failed scrape PIC ${customUsername}: ${
                            e instanceof Error ? e.message : e
                        } — trying fallback`
                    );
                    // lanjut ke kandidat berikutnya (PIC 2)
                }
            }

            console.warn(`[WO][${task.wh.name}] Semua PIC gagal.`);
            return [];
        });

        const allNewHeaders = headerResults.flat();

        const uniqueHeadersMap = new Map<string, (typeof allNewHeaders)[number]>();
        for (const h of allNewHeaders) {
            uniqueHeadersMap.set(h.pemakaian_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        if (deduplicatedHeaders.length > 0) {
            await db.transaction().execute(async (trx) => {
                for (const h of deduplicatedHeaders) {
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
                        })
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
            .select(['h.id', 'h.pemakaian_id', 'h.nama_gudang'])
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
                    const normalized = gudang.replace(/\s+/g, '').toLowerCase();
                    const wh = whs.find(
                        (w) => (w.name || '').replace(/\s+/g, '').toLowerCase() === normalized
                    );
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
                            })),
                            customUsername,
                            customPassword
                        );
                    } catch (e: unknown) {
                        console.error(
                            `Failed to scrape details for WO gudang ${task.gudang}:`,
                            e instanceof Error ? e.message : e
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
                                (m: Record<string, string | number>) => ({
                                    header_id: d.header_id,
                                    material_id: (m['ID MATERIAL'] as string) || null,
                                    material_desc: (m['NAMA MATERIAL'] as string) || null,
                                    uom: (m.SATUAN as string) || null,
                                    qty_pemakaian: Number(m['QTY PEMAKAIAN']) || null,
                                })
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

        return {
            success: true,
            message: `Scraping selesai. ${totalInserted} data WO Lensa baru berhasil disimpan.`,
        };
    } catch (error: unknown) {
        console.error('Trigger WO scraping error:', error);
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : 'Terjadi kesalahan saat sinkronisasi WO Lensa.',
        };
    }
}

export async function triggerWOScraping(): Promise<
    { success: true; jobId: string } | { success: false; error: string }
> {
    const jobId = `wo_lensa_scrape_${Date.now()}`;
    await redis.set(`job:${jobId}`, JSON.stringify({ status: 'running' }));

    Promise.resolve().then(async () => {
        try {
            const result = await internalTriggerWOScraping(undefined, true);
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
        revalidatePath('/apps/wo-lensa-ref');
    }
    return parsed;
}

export async function getWOLensaRefDetails(headerId: number) {
    try {
        const details = await db
            .selectFrom('inventory.wo_lensa_list')
            .selectAll()
            .where('header_id', '=', String(headerId))
            .execute();

        return { success: true, data: details };
    } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
