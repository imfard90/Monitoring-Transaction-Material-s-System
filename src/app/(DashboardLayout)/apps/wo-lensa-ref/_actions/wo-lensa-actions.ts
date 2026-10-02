'use server';

import crypto from 'crypto';
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
        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
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
        whNames = whs.map((w: any) => w.name);
        if (whNames.includes('SO Karangpilang')) whNames.push('SO Karang Pilang');
        if (whNames.includes('SO Karang Pilang')) whNames.push('SO Karangpilang');
    }

    if (isStaff && whNames.length === 0) {
        return [];
    }

    let query = db
        .selectFrom('inventory.wo_lensa_header')
        .selectAll()
        .orderBy('pemakaian_id', 'desc');

    if (isStaff && whNames.length > 0) {
        query = query.where('nama_gudang', 'in', whNames);
    }

    const list = await query.execute();
    return list;
}

async function internalTriggerWOScraping() {
    try {
        const validUsers = await db
            .selectFrom('auth.user as u')
            .where('u.lensa_acount', 'is not', null)
            .select(['u.id', 'u.lensa_acount'])
            .execute();

        if (validUsers.length === 0) {
            return {
                success: false,
                message: 'Tidak ada user Lensa yang valid untuk melakukan scraping.',
            };
        }

        const existingHeaders = await db
            .selectFrom('inventory.wo_lensa_header')
            .select(['pemakaian_id'])
            .execute();
        const existingPemakaianIds = existingHeaders.map((h) => String(h.pemakaian_id));

        let totalInserted = 0;

        const headerPromises = validUsers.map(async (u) => {
            const lensaAcount = u.lensa_acount as any;
            if (!lensaAcount?.username || !lensaAcount?.password) return [];

            const customUsername = lensaAcount.username;
            let customPassword = '';

            try {
                customPassword = decrypt(lensaAcount.password);
            } catch (_e) {
                console.error(`Failed to decrypt password for user ${u.id}`);
                return [];
            }

            try {
                const newHeaders = await scrapeWOLensaHeaders(
                    existingPemakaianIds,
                    customUsername,
                    customPassword
                );
                return newHeaders;
            } catch (e: any) {
                console.error(
                    `Failed to scrape WO headers for user ${customUsername}:`,
                    e.message || e
                );
                return [];
            }
        });

        const headerResults = await Promise.all(headerPromises);
        const allNewHeaders = headerResults.flat();

        const uniqueHeadersMap = new Map();
        for (const h of allNewHeaders) {
            uniqueHeadersMap.set(h.pemakaian_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        if (deduplicatedHeaders.length > 0) {
            await db.transaction().execute(async (trx: any) => {
                for (const h of deduplicatedHeaders) {
                    await trx
                        .insertInto('inventory.wo_lensa_header')
                        .values({
                            pemakaian_id: h.pemakaian_id,
                            gi_number: h.gi_number,
                            nama_gudang: h.nama_gudang,
                            nik_pemakai: h.nik_pemakai,
                            tanggal_update: h.tanggal_update,
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
            .select(['h.id', 'h.pemakaian_id'])
            .where('l.id', 'is', null)
            .execute();

        if (headersMissingDetails.length > 0 && validUsers.length > 0) {
            const u = validUsers[0];
            const lensaAcount = u.lensa_acount as any;
            const customUsername = lensaAcount.username;
            let customPassword = '';
            try {
                customPassword = decrypt(lensaAcount.password);
            } catch (_e) {}

            if (customUsername && customPassword) {
                const details = await scrapeWOLensaDetails(
                    headersMissingDetails.map((h) => ({
                        id: Number(h.id),
                        pemakaian_id: String(h.pemakaian_id),
                    })),
                    customUsername,
                    customPassword
                );

                if (details.length > 0) {
                    await db.transaction().execute(async (trx: any) => {
                        for (const d of details) {
                            if (d.materials && d.materials.length > 0) {
                                const materialInserts = d.materials.map((m: any) => ({
                                    header_id: d.header_id,
                                    material_id: m['ID MATERIAL'] || null,
                                    material_desc: m['NAMA MATERIAL'] || null,
                                    uom: m['SATUAN'] || null,
                                    qty_pemakaian: Number(m['QTY PEMAKAIAN']) || null,
                                }));
                                await trx
                                    .insertInto('inventory.wo_lensa_list')
                                    .values(materialInserts)
                                    .execute();
                            }
                        }
                    });
                }
            }
        }

        return {
            success: true,
            message: `Scraping selesai. ${totalInserted} data WO Lensa baru berhasil disimpan.`,
        };
    } catch (error: any) {
        console.error('Trigger WO scraping error:', error);
        return {
            success: false,
            message: error.message || 'Terjadi kesalahan saat sinkronisasi WO Lensa.',
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
            const result = await internalTriggerWOScraping();
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
        } catch (error: any) {
            await redis.set(
                `job:${jobId}`,
                JSON.stringify({ status: 'error', error: error.message }),
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
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
