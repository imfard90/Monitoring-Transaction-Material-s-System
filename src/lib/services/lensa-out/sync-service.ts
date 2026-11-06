import { db } from '@/lib/db/db';
import { scrapeLensaDetails, scrapeLensaHeaders } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import {
    type ScraperAction,
    scraperLogRepository,
} from '@/lib/repositories/scraper-log.repository';
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';
import { asyncPool, decryptLensaPassword } from '../lensa-crypto';
import type { OutLensaScrapeOutcome } from './types';

/**
 * Service murni untuk eksekusi scraping Out Lensa (headers + details).
 * Bebas dari ketergantungan HTTP request Next.js (bisa dijalankan via Worker PM2 atau CLI).
 */
export async function executeOutLensaScraping(
    perpage: number = 20,
    action: ScraperAction = 'system'
): Promise<OutLensaScrapeOutcome> {
    try {
        const users = await db
            .selectFrom('auth.user')
            .select(['id', 'lensa_acount'])
            .where('lensa_acount', 'is not', null)
            .execute();

        const validUsers = users.filter((u) => {
            const lensesAcount = u.lensa_acount;
            return Boolean(lensesAcount?.username && lensesAcount.password);
        });

        if (validUsers.length === 0) {
            const errorMsg = 'Tidak ada user Lensa yang terdaftar dengan kredensial lengkap.';
            await scraperLogRepository
                .insertLog({
                    scraper_type: 'out_lensa',
                    action,
                    resume_result: `Gagal: ${errorMsg}`,
                })
                .catch((err) => {
                    actionLogger.warn('[Out-Lensa] Gagal mencatat scraper_cronjob_log:', err);
                });
            return {
                success: false,
                error: errorMsg,
            };
        }

        // Ambil header terkini dengan batas 10.000 untuk mencegah unbounded memory scan di RAM
        const existingHeaders = await db
            .selectFrom('inventory.out_lensa_ref_header')
            .select('reservation_id')
            .orderBy('created_at', 'desc')
            .limit(10000)
            .execute();
        const existingHeaderIds = existingHeaders.map((h) => h.reservation_id);

        let totalInserted = 0;
        let totalUsersScraped = 0;

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
            const lensesAcount = u.lensa_acount;
            if (!lensesAcount) return [];
            const customUsername = lensesAcount.username;
            let customPassword = '';

            try {
                customPassword = decryptLensaPassword(lensesAcount.password);
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
                return newHeaders.map((h) => ({ ...h, scraped_by_username: customUsername }));
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                const isLoginErr =
                    msg.toLowerCase().includes('sesi') || msg.toLowerCase().includes('login');
                accountResults.push({
                    username: customUsername,
                    phase: 'headers',
                    status: isLoginErr ? 'login_fail' : 'scrape_fail',
                    count: 0,
                    error: msg,
                });
                actionLogger.error(
                    `Failed to scrape headers for user ${customUsername}:`,
                    new Error(msg)
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
            const giNumbers = deduplicatedHeaders
                .map((h) => (h.gi_number ? String(h.gi_number).trim() : ''))
                .filter(Boolean);
            const resIds = deduplicatedHeaders
                .map((h) => (h.reservation_id ? String(h.reservation_id).trim() : ''))
                .filter(Boolean);

            const matchedSapNumbers = new Set<string>();
            const matchedRequestIds = new Set<string>();

            if (giNumbers.length > 0 || resIds.length > 0) {
                let query = db
                    .selectFrom('inventory.sap_out_header')
                    .select(['sap_number', 'request_id']);

                if (giNumbers.length > 0 && resIds.length > 0) {
                    query = query.where((eb) =>
                        eb.or([eb('sap_number', 'in', giNumbers), eb('request_id', 'in', resIds)])
                    );
                } else if (giNumbers.length > 0) {
                    query = query.where('sap_number', 'in', giNumbers);
                } else {
                    query = query.where('request_id', 'in', resIds);
                }

                const existingSap = await query.execute();
                for (const s of existingSap) {
                    if (s.sap_number?.trim()) matchedSapNumbers.add(s.sap_number.trim());
                    if (s.request_id?.trim()) matchedRequestIds.add(s.request_id.trim());
                }
            }

            await db.transaction().execute(async (trx) => {
                for (const h of deduplicatedHeaders) {
                    const gi = h.gi_number ? String(h.gi_number).trim() : '';
                    const res = h.reservation_id ? String(h.reservation_id).trim() : '';
                    const isSapOutCheck =
                        (Boolean(gi) && matchedSapNumbers.has(gi)) ||
                        (Boolean(res) && matchedRequestIds.has(res));

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
                        })
                        .execute();
                    totalInserted++;
                    existingHeaderIds.push(h.reservation_id);
                }
            });
        }

        // PHASE 2: SCRAPE DETAILS
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

            const groupedHeaders: Record<string, any[]> = {};
            for (const h of headersMissingDetails) {
                const gudang = h.nama_gudang || 'UNKNOWN';
                if (!groupedHeaders[gudang]) groupedHeaders[gudang] = [];
                groupedHeaders[gudang].push(h);
            }

            const userDetailTasks = Object.keys(groupedHeaders)
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

            const detailResults = await asyncPool(5, userDetailTasks, async (task) => {
                const { userObj, headers, gudang } = task;
                const lensesAcount = userObj.lensa_acount;
                if (!lensesAcount) return [];
                const customUsername = lensesAcount.username;
                let customPassword = '';
                try {
                    customPassword = decryptLensaPassword(lensesAcount.password);
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
                    } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : String(e);
                        const isLoginErr =
                            msg.toLowerCase().includes('sesi') ||
                            msg.toLowerCase().includes('login');
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
                            new Error(msg)
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

            if (allDetails.length > 0) {
                await db.transaction().execute(async (trx) => {
                    for (const d of allDetails) {
                        if (d.mitra) {
                            await trx
                                .updateTable('inventory.out_lensa_ref_header')
                                .set({ mitra: d.mitra })
                                .where('id', '=', String(d.header_id))
                                .execute();
                        }

                        if (d.materials && d.materials.length > 0) {
                            const materialInserts = d.materials.map((m) => ({
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
            totalUsersScraped = validUsers.length;
        }

        const summary = {
            totalAccounts: validUsers.length,
            headersInserted: totalInserted,
            usersScraped: totalUsersScraped,
            accountResults,
        };
        actionLogger.info('[OUT-Lensa] Scrape summary:', {
            summary: JSON.stringify(summary, null, 2),
        });

        const resumeResult =
            totalInserted > 0
                ? `Sukses ${totalInserted} data baru (${totalUsersScraped} akun)`
                : `Selesai: Tidak ada data baru (${totalUsersScraped} akun)`;

        await scraperLogRepository
            .insertLog({
                scraper_type: 'out_lensa',
                action,
                resume_result: resumeResult,
            })
            .catch((err) => {
                actionLogger.warn('[Out-Lensa] Gagal mencatat scraper_cronjob_log:', err);
            });

        return {
            success: true,
            newCount: totalInserted,
            usersScraped: totalUsersScraped,
            accountResults,
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Trigger scraping error:',
            error instanceof Error ? error : new Error(String(error))
        );
        const errMsg = error instanceof Error ? error.message : String(error);
        await scraperLogRepository
            .insertLog({
                scraper_type: 'out_lensa',
                action,
                resume_result: `Gagal: ${errMsg}`,
            })
            .catch((err) => {
                actionLogger.warn('[Out-Lensa] Gagal mencatat scraper_cronjob_log:', err);
            });
        return { success: false, error: errMsg };
    }
}
