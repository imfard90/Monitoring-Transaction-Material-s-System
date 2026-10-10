// biome-ignore lint/suspicious/noExplicitAny: legacy code
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
} from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';

// P3-S6 Fix: Derive a strict 32-byte key from the environment variable using SHA-256
// instead of a weak slice(0,32) which might pad with weak characters or truncate.
const getEncryptionKey = () => {
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('MFA_ENCRYPTION_SECRET is not set');
    }
    // Hash the secret to guarantee exactly 32 bytes of high entropy for AES-256
    return crypto.createHash('sha256').update(secret).digest();
};

function decrypt(text: string) {
    // getEncryptionKey() validates the secret and returns a 32-byte key
    const textParts = text.split(':');
    const shifted = textParts.shift();
    if (!shifted) throw new Error('Invalid encrypted text format');
    const iv = Buffer.from(shifted, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}


async function asyncPool(poolLimit: number, array: any[], iteratorFn: (item: any) => Promise<any>) {
    const ret: Promise<any>[] = [];
    const executing: Promise<void>[] = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);

        if (poolLimit <= array.length) {
            const e: any = p.then(() => { executing.splice(executing.indexOf(e), 1); });
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

export async function internalTriggerScraping(perpage: number = 20) {
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

        // Track per-account outcomes for diagnostics
        const accountResults: Array<{
            username: string;
            phase: 'headers' | 'details';
            gudang?: string;
            status: 'success' | 'login_fail' | 'scrape_fail' | 'no_data' | 'skip';
            count: number;
            error?: string;
        }> = [];

        // PHASE 1: SCRAPE HEADERS
        const headerResults = await asyncPool(5, validUsers, async (u) => {
            const lensaAcount: any = u.lensa_acount;
            const customUsername = lensaAcount.username;
            let customPassword = '';

            try {
                customPassword = decrypt(lensaAcount.password);
            } catch (_e) {
                actionLogger.error(`Failed to decrypt password for user ${u.id}`);
                accountResults.push({
                    username: customUsername,
                    phase: 'headers',
                    status: 'skip',
                    count: 0,
                    error: 'decrypt_failed',
                });
                return [];
            }

            try {
                const newHeaders = await scrapeLensaHeaders(
                    existingHeaderIds,
                    customUsername,
                    customPassword,
                    perpage
                );
                accountResults.push({
                    username: customUsername,
                    phase: 'headers',
                    status: newHeaders.length > 0 ? 'success' : 'no_data',
                    count: newHeaders.length,
                });
                return newHeaders.map((h: any) => ({ ...h, scraped_by_username: customUsername }));
            } catch (e: any) {
                const msg = e.message || String(e);
                const isLoginErr = msg.toLowerCase().includes('sesi') || msg.toLowerCase().includes('login');
                accountResults.push({
                    username: customUsername,
                    phase: 'headers',
                    status: isLoginErr ? 'login_fail' : 'scrape_fail',
                    count: 0,
                    error: msg,
                });
                actionLogger.error(
                    `Failed to scrape headers for user ${customUsername}:`,
                    msg
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
                            formatted_date: h.formatted_date,
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
                    accountResults.push({
                        username: customUsername,
                        phase: 'details',
                        gudang,
                        status: 'skip',
                        count: 0,
                        error: 'decrypt_failed',
                    });
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
                        accountResults.push({
                            username: customUsername,
                            phase: 'details',
                            gudang,
                            status: details.length > 0 ? 'success' : 'no_data',
                            count: details.length,
                        });
                        return details;
                    } catch (e: any) {
                        const msg = e.message || String(e);
                        const isLoginErr = msg.toLowerCase().includes('sesi') || msg.toLowerCase().includes('login');
                        accountResults.push({
                            username: customUsername,
                            phase: 'details',
                            gudang,
                            status: isLoginErr ? 'login_fail' : 'scrape_fail',
                            count: 0,
                            error: msg,
                        });
                        actionLogger.error(
                            `Failed to scrape details for gudang ${gudang}:`,
                            msg
                        );
                        return [];
                    }
                }
                accountResults.push({
                    username: customUsername,
                    phase: 'details',
                    gudang,
                    status: 'skip',
                    count: 0,
                    error: 'missing_credentials',
                });
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

        // Summarize diagnostics
        const summary = {
            totalAccounts: validUsers.length,
            headersInserted: totalInserted,
            usersScraped: totalUsersScraped,
            accountResults,
        };
        actionLogger.info('[OUT-Lensa] Scrape summary:', { summary: JSON.stringify(summary, null, 2) });

        return { success: true, newCount: totalInserted, usersScraped: totalUsersScraped, accountResults };
    } catch (error: any) {
        actionLogger.error('Trigger scraping error:', error instanceof Error ? error : new Error(String(error)));
        return { success: false, error: error.message };
    }
}


export async function triggerScraping(): Promise<
    { success: true; jobId: string } | { success: false; error: string }
> {
    const LOCK_KEY = 'lock:out_lensa_scrape';
    const LOCK_TTL = 1800; // 30 menit, cukup untuk satu siklus scrape penuh

    // Acquire active-job lock (atomic SET NX) untuk mencegah manual/cron overlap
    const acquired = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX');
    if (!acquired) {
        return {
            success: false,
            error: 'Scrape sedang berjalan (manual/cron overlap). Coba lagi nanti.',
        };
    }

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
        } finally {
            // Release lock setelah selesai (atau gagal)
            await redis.del(LOCK_KEY);
        }
    });

    return { success: true, jobId };
}


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
                    customPassword = decrypt(account.password);
                } catch (e) {
                    actionLogger.error('Failed to decrypt user password', e instanceof Error ? e : new Error(String(e)));
                }
            }
        }

        const result = await scrapeReservation(id, customUsername, customPassword);
        return result;
    } catch (error: any) {
        return { error: error.message };
    }
}