'use server';

import crypto from 'node:crypto';
import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { redis } from '@/lib/redis';
import {
    scrapeLensaDetails,
    scrapeLensaHeaders,
    scrapeReservation,
} from '../../../../../../.external_scrapping/lensa-scraper';

const ENCRYPTION_KEY = (process.env.MFA_ENCRYPTION_SECRET || '').slice(0, 32);

function decrypt(text: string) {
    if (ENCRYPTION_KEY?.length !== 32) throw new Error('Invalid MFA_ENCRYPTION_SECRET');
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export async function getOutLensaRefList() {
    try {
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
            return { success: true, data: [] };
        }

        await sql`
            UPDATE inventory.out_lensa_ref_header h
            SET sap_out_check = TRUE
            FROM inventory.sap_out_header s
            WHERE h.gi_number = s.sap_number AND (h.sap_out_check IS FALSE OR h.sap_out_check IS NULL)
        `.execute(db);

        let query = db
            .selectFrom('inventory.out_lensa_ref_header')
            .selectAll()
            .orderBy('tgl_entry', 'desc');

        if (isStaff && whNames.length > 0) {
            query = query.where('nama_gudang', 'in', whNames);
        }

        const headers = await query.execute();

        const headerIds = headers.map((h: any) => h.id);

        let details: any[] = [];
        if (headerIds.length > 0) {
            details = await db
                .selectFrom('inventory.out_lensa_ref_list')
                .selectAll()
                .where('header_id', 'in', headerIds)
                .execute();
        }

        const data = headers.map((h: any) => ({
            ...h,
            materials: details.filter((d) => d.header_id === h.id),
        }));

        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

async function asyncPool(poolLimit: number, array: any[], iteratorFn: (item: any) => Promise<any>) {
    const ret: Promise<any>[] = [];
    const executing: Promise<void>[] = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);

        if (poolLimit <= array.length) {
            const e: any = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

async function internalTriggerScraping() {
    try {
        const users = await db
            .selectFrom('auth.user')
            .select(['id', 'lensa_acount'])
            .where('lensa_acount', 'is not', null)
            .execute();

        const validUsers = users.filter((u: any) => {
            const lensaAcount: any = u.lensa_acount;
            return lensaAcount?.username && lensaAcount.password;
        });

        if (validUsers.length === 0) {
            return {
                success: false,
                error: 'Tidak ada user Lensa yang terdaftar dengan kredensial lengkap.',
            };
        }

        const existingHeaders = await db
            .selectFrom('inventory.out_lensa_ref_header')
            .select('reservation_id')
            .execute();
        const existingHeaderIds = existingHeaders.map((h: any) => h.reservation_id);

        let totalInserted = 0;
        let totalUsersScraped = 0;

        // PHASE 1: SCRAPE HEADERS
        const headerResults = await asyncPool(5, validUsers, async (u) => {
            const lensaAcount: any = u.lensa_acount;
            const customUsername = lensaAcount.username;
            let customPassword = '';

            try {
                customPassword = decrypt(lensaAcount.password);
            } catch (_e) {
                console.error(`Failed to decrypt password for user ${u.id}`);
                return [];
            }

            try {
                const newHeaders = await scrapeLensaHeaders(
                    existingHeaderIds,
                    customUsername,
                    customPassword
                );
                return newHeaders.map((h: any) => ({ ...h, scraped_by_username: customUsername }));
            } catch (e: any) {
                console.error(
                    `Failed to scrape headers for user ${customUsername}:`,
                    e.message || e
                );
                return [];
            }
        });

        const allNewHeaders = headerResults.flat();
        const uniqueHeadersMap = new Map();
        for (const h of allNewHeaders) {
            uniqueHeadersMap.set(h.reservation_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        // Insert new headers sequentially
        if (deduplicatedHeaders.length > 0) {
            // Pre-check for sap_out_check before saving
            const giNumbers = deduplicatedHeaders.map((h: any) => h.gi_number).filter(Boolean);
            let matchedSapNumbers: string[] = [];

            if (giNumbers.length > 0) {
                const existingSap = await db
                    .selectFrom('inventory.sap_out_header')
                    .select(['sap_number'])
                    .where('sap_number', 'in', giNumbers)
                    .execute();
                matchedSapNumbers = existingSap
                    .map((s) => s.sap_number)
                    .filter((n): n is string => n !== null);
            }

            await db.transaction().execute(async (trx: any) => {
                for (const h of deduplicatedHeaders) {
                    const isSapOutCheck = matchedSapNumbers.includes(h.gi_number);
                    await trx
                        .insertInto('inventory.out_lensa_ref_header')
                        .values({
                            reservation_id: h.reservation_id,
                            tgl_entry: h.tgl_entry,
                            nama_gudang: h.nama_gudang,
                            regional: h.regional,
                            project_id: h.project_id,
                            nik_pemakai: h.nik_pemakai,
                            reservation_id_sap: h.reservation_id_sap,
                            scraped_by_username: h.scraped_by_username,
                            gi_number: h.gi_number,
                            status_proses: h.status_proses,
                            sap_out_check: isSapOutCheck,
                        } as any) // Typecast due to dynamic added column
                        .execute();
                    totalInserted++;
                    existingHeaderIds.push(h.reservation_id);
                }
            });
        }

        // PHASE 2: SCRAPE DETAILS
        // Get headers that don't have details
        const headersMissingDetails = await db
            .selectFrom('inventory.out_lensa_ref_header as h')
            .leftJoin('inventory.out_lensa_ref_list as l', 'l.header_id', 'h.id')
            .select(['h.id', 'h.reservation_id', 'h.nama_gudang'])
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

            // Group by nama_gudang
            const groupedHeaders: Record<string, any[]> = {};
            for (const h of headersMissingDetails) {
                const gudang = h.nama_gudang || 'UNKNOWN';
                if (!groupedHeaders[gudang]) groupedHeaders[gudang] = [];
                groupedHeaders[gudang].push(h);
            }

            // Prepare tasks per gudang credential
            const userDetailTasks = Object.keys(groupedHeaders)
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

            const detailResults = await asyncPool(5, userDetailTasks, async (task: any) => {
                const { userObj, headers, gudang } = task;
                const lensaAcount = userObj.lensa_acount as any;
                const customUsername = lensaAcount.username;
                let customPassword = '';
                try {
                    customPassword = decrypt(lensaAcount.password);
                } catch (_e) {
                    return [];
                }

                if (customUsername && customPassword) {
                    try {
                        const details = await scrapeLensaDetails(
                            headers,
                            customUsername,
                            customPassword
                        );
                        totalUsersScraped++;
                        return details;
                    } catch (e: any) {
                        console.error(
                            `Failed to scrape details for gudang ${gudang}:`,
                            e.message || e
                        );
                        return [];
                    }
                }
                return [];
            });

            const allDetails = detailResults.flat();

            // Insert details sequentially
            if (allDetails.length > 0) {
                await db.transaction().execute(async (trx: any) => {
                    for (const d of allDetails) {
                        // Update mitra on header
                        if (d.mitra) {
                            await trx
                                .updateTable('inventory.out_lensa_ref_header')
                                .set({ mitra: d.mitra })
                                .where('id', '=', d.header_id)
                                .execute();
                        }

                        // Insert materials
                        if (d.materials && d.materials.length > 0) {
                            const materialInserts = d.materials.map((m: any) => ({
                                header_id: d.header_id,
                                material_id: m['ID MATERIAL'] || null,
                                material_desc:
                                    m['NAMA MATERIAL'] ||
                                    m['MATERIAL DESC'] ||
                                    m.DESCRIPTION ||
                                    null,
                                qty_approve: m['QTY ACCEPTED'] || m['QTY APPROVE'] || null,
                            }));

                            await trx
                                .insertInto('inventory.out_lensa_ref_list')
                                .values(materialInserts)
                                .execute();
                        }
                    }
                });
            }
        } else {
            // If there were no headers missing details, we still count users scraped based on the first phase length
            totalUsersScraped = validUsers.length;
        }

        return { success: true, newCount: totalInserted, usersScraped: totalUsersScraped };
    } catch (error: any) {
        console.error('Trigger scraping error:', error);
        return { success: false, error: error.message };
    }
}

export async function triggerScraping(): Promise<
    { success: true; jobId: string } | { success: false; error: string }
> {
    const jobId = `out_lensa_scrape_${Date.now()}`;
    await redis.set(`job:${jobId}`, JSON.stringify({ status: 'running' }));

    // Background worker
    Promise.resolve().then(async () => {
        try {
            const result = await internalTriggerScraping();
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

export async function checkScrapingStatus(jobId: string) {
    const data = await redis.get(`job:${jobId}`);
    if (!data) return { status: 'not_found' };

    const parsed = JSON.parse(data);
    if (parsed.status === 'success') {
        revalidatePath('/apps/out-lensa-ref');
    }
    return parsed;
}

export async function getOutLensaRefDetails(headerId: string) {
    try {
        const details = await db
            .selectFrom('inventory.out_lensa_ref_list')
            .selectAll()
            .where('header_id', '=', headerId)
            .execute();

        const header = await db
            .selectFrom('inventory.out_lensa_ref_header')
            .select(['gi_number'])
            .where('id', '=', headerId)
            .executeTakeFirst();

        let sapItems: any[] = [];
        if (header?.gi_number) {
            const sapHeader = await db
                .selectFrom('inventory.sap_out_header')
                .select(['id'])
                .where('sap_number', '=', header.gi_number)
                .executeTakeFirst();

            if (sapHeader) {
                sapItems = await db
                    .selectFrom('inventory.sap_out_items as si')
                    .innerJoin('inventory.materials as m', 'm.id', 'si.designator_id')
                    .select(['m.code as material_id', 'si.qty_req'])
                    .where('si.header_id', '=', sapHeader.id)
                    .execute();
            }
        }

        const data = details.map((d: any) => {
            let matched = false;
            if (sapItems.length > 0) {
                const sapItem = sapItems.find(
                    (si: any) =>
                        si.material_id === d.material_id &&
                        Number(si.qty_req) === Number(d.qty_approve)
                );
                if (sapItem) matched = true;
            }
            return {
                ...d,
                sap_out_matched: matched,
            };
        });

        return { success: true, data };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function scrapeReservationAction(id: string) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        let customUsername, customPassword;

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
                    customPassword = decrypt(account.password);
                } catch (e) {
                    console.error('Failed to decrypt user password', e);
                }
            }
        }

        const result = await scrapeReservation(id, customUsername, customPassword);
        return result;
    } catch (error: any) {
        return { error: error.message };
    }
}
