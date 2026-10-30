import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import { scrapeLensaDetails, scrapeLensaHeaders } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { resolveMaterialAlias } from '@/lib/material-alias-helper';
import {
    type ScraperAction,
    scraperLogRepository,
} from '@/lib/repositories/scraper-log.repository';
import { findMatchingMasterWarehouse } from '@/lib/warehouse-helper';
import { asyncPool, decryptLensaPassword } from './lensa-crypto';

export interface ScrapedOutLensaDetailMaterial {
    material_id: string | null;
    material_desc: string | null;
    qty_approve: string | null;
}

export interface ScrapedOutLensaDetailResult {
    reservation_id: string;
    gi_number: string | null;
    nama_gudang: string | null;
    mitra: string | null;
    materials: ScrapedOutLensaDetailMaterial[];
}

export interface OutLensaScrapeOutcome {
    success: boolean;
    newCount?: number;
    usersScraped?: number;
    accountResults?: Array<{
        username: string;
        phase: 'headers' | 'details';
        gudang?: string;
        status: 'success' | 'login_fail' | 'scrape_fail' | 'no_data' | 'skip';
        count: number;
        error?: string;
    }>;
    error?: string;
}

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

        const validUsers = users.filter((u: any) => {
            const lensaAcount: any = u.lensa_acount;
            return lensaAcount?.username && lensaAcount.password;
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
        const existingHeaderIds = existingHeaders.map((h: any) => h.reservation_id);

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
            const lensaAcount: any = u.lensa_acount;
            const customUsername = lensaAcount.username;
            let customPassword = '';

            try {
                customPassword = decryptLensaPassword(lensaAcount.password);
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
                const isLoginErr =
                    msg.toLowerCase().includes('sesi') || msg.toLowerCase().includes('login');
                accountResults.push({
                    username: customUsername,
                    phase: 'headers',
                    status: isLoginErr ? 'login_fail' : 'scrape_fail',
                    count: 0,
                    error: msg,
                });
                actionLogger.error(`Failed to scrape headers for user ${customUsername}:`, msg);
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
                .map((h: any) => (h.gi_number ? String(h.gi_number).trim() : ''))
                .filter(Boolean);
            const resIds = deduplicatedHeaders
                .map((h: any) => (h.reservation_id ? String(h.reservation_id).trim() : ''))
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

            await db.transaction().execute(async (trx: any) => {
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
                        } as any)
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

            const detailResults = await asyncPool(5, userDetailTasks, async (task: any) => {
                const { userObj, headers, gudang } = task;
                const lensaAcount = userObj.lensa_acount as any;
                const customUsername = lensaAcount.username;
                let customPassword = '';
                try {
                    customPassword = decryptLensaPassword(lensaAcount.password);
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
                        actionLogger.error(`Failed to scrape details for gudang ${gudang}:`, msg);
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
                await db.transaction().execute(async (trx: any) => {
                    for (const d of allDetails) {
                        if (d.mitra) {
                            await trx
                                .updateTable('inventory.out_lensa_ref_header')
                                .set({ mitra: d.mitra })
                                .where('id', '=', d.header_id)
                                .execute();
                        }

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
    } catch (error: any) {
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

/**
 * Service untuk scraping single detail reservation Out Lensa
 */
export async function scrapeSingleOutLensaDetailService(
    reservationId: string,
    sessionNik?: string
): Promise<{
    success: boolean;
    data?: ScrapedOutLensaDetailResult;
    error?: string;
}> {
    try {
        const header = await db
            .selectFrom('inventory.out_lensa_ref_header')
            .selectAll()
            .where('reservation_id', '=', reservationId)
            .executeTakeFirst();

        let customUsername = '';
        let customPassword = '';

        if (sessionNik) {
            const loggedUser = await db
                .selectFrom('auth.user')
                .select([
                    sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                    sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                ])
                .where('nik', '=', sessionNik)
                .executeTakeFirst();

            if (loggedUser?.lensa_username && loggedUser?.lensa_password) {
                try {
                    customUsername = loggedUser.lensa_username;
                    customPassword = decryptLensaPassword(loggedUser.lensa_password);
                } catch (e) {
                    actionLogger.warn('Failed to decrypt user Lensa password', {
                        error: e instanceof Error ? e.message : String(e),
                    });
                }
            }
        }

        if ((!customUsername || !customPassword) && header?.nama_gudang) {
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select(['name', 'pic_1', 'pic_2'])
                .execute();
            const matchedWh = findMatchingMasterWarehouse(header.nama_gudang, whs);
            if (matchedWh) {
                for (const picNik of [matchedWh.pic_1, matchedWh.pic_2]) {
                    if (!picNik) continue;
                    const picUser = await db
                        .selectFrom('auth.user')
                        .select([
                            sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                            sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                        ])
                        .where('nik', '=', picNik)
                        .executeTakeFirst();

                    if (picUser?.lensa_username && picUser?.lensa_password) {
                        try {
                            customUsername = picUser.lensa_username;
                            customPassword = decryptLensaPassword(picUser.lensa_password);
                            if (customUsername && customPassword) break;
                        } catch {}
                    }
                }
            }
        }

        if (!customUsername || !customPassword) {
            const anyLensaUsers = await db
                .selectFrom('auth.user')
                .select([
                    sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                    sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
                ])
                .where('lensa_acount', 'is not', null)
                .execute();

            for (const u of anyLensaUsers) {
                if (u.lensa_username && u.lensa_password) {
                    try {
                        customUsername = u.lensa_username;
                        customPassword = decryptLensaPassword(u.lensa_password);
                        if (customUsername && customPassword) break;
                    } catch {}
                }
            }
        }

        if (!customUsername || !customPassword) {
            customUsername = process.env.LENSA_USERNAME || '';
            customPassword = process.env.LENSA_PASSWORD || '';
        }

        if (!customUsername || !customPassword) {
            return {
                success: false,
                error: 'Kredensial akun Lensa tidak ditemukan. Pastikan ada akun Lensa yang terhubung.',
            };
        }

        const headerId = header ? header.id : '0';

        actionLogger.info(
            `[Out-Lensa-Detail-Manual] Scraping detail for reservation_id=${reservationId}...`
        );
        const scrapeResults = await scrapeLensaDetails(
            [{ id: Number(headerId) || 0, reservation_id: reservationId }],
            customUsername,
            customPassword,
            1
        );

        const detailItem = scrapeResults[0];
        const rawMaterials = detailItem?.materials || [];
        const scrapedMitra = detailItem?.mitra || null;

        // 4. Buat header jika belum ada
        let targetHeaderId = headerId;
        if (!header) {
            const created = await db
                .insertInto('inventory.out_lensa_ref_header')
                .values({
                    reservation_id: reservationId,
                    tgl_entry: new Date().toISOString(),
                    formatted_date: new Date().toISOString().slice(0, 10),
                    mitra: scrapedMitra,
                } as any)
                .returning('id')
                .executeTakeFirst();
            if (created) {
                targetHeaderId = String((created as any).id);
            }
        } else if (scrapedMitra && !header.mitra) {
            await db
                .updateTable('inventory.out_lensa_ref_header')
                .set({ mitra: scrapedMitra })
                .where('id', '=', String(header.id))
                .execute();
        }

        const mappedMaterials: ScrapedOutLensaDetailMaterial[] = rawMaterials.map(
            (m: Record<string, string>) => {
                const rawMaterialId = (m['ID MATERIAL'] as string)?.trim() || null;
                const materialDesc =
                    m['NAMA MATERIAL'] || m['MATERIAL DESC'] || m.DESCRIPTION || null;
                let materialId = rawMaterialId;
                if (!materialId && materialDesc) {
                    const resolved = resolveMaterialAlias(materialDesc);
                    if (resolved) materialId = resolved;
                }
                return {
                    material_id: materialId,
                    material_desc: materialDesc,
                    qty_approve:
                        m['QTY ACCEPTED'] || m['QTY APPROVE']
                            ? String(m['QTY ACCEPTED'] || m['QTY APPROVE'])
                            : null,
                };
            }
        );

        if (targetHeaderId && targetHeaderId !== '0' && mappedMaterials.length > 0) {
            await db.transaction().execute(async (trx: any) => {
                await trx
                    .deleteFrom('inventory.out_lensa_ref_list')
                    .where('header_id', '=', String(targetHeaderId))
                    .execute();

                const dbInserts = mappedMaterials.map((m) => ({
                    header_id: String(targetHeaderId),
                    material_id: m.material_id,
                    material_desc: m.material_desc,
                    qty_approve: m.qty_approve,
                }));

                await trx.insertInto('inventory.out_lensa_ref_list').values(dbInserts).execute();
            });
        }

        // Catat ke inventory.scraper_cronjob_log
        const resume =
            mappedMaterials.length > 0
                ? `Sukses menarik ${mappedMaterials.length} material untuk Reservasi ${reservationId}`
                : `Selesai: Tidak ada material ditemukan untuk Reservasi ${reservationId}`;

        await scraperLogRepository
            .insertLog({
                scraper_type: 'out_lensa',
                action: 'manual',
                resume_result: `Detail Manual: ${resume}`,
            })
            .catch((err) => {
                actionLogger.warn('[Out-Lensa] Gagal mencatat log scraper_cronjob_log:', err);
            });

        return {
            success: true,
            data: {
                reservation_id: reservationId,
                gi_number: header?.gi_number ?? null,
                nama_gudang: header?.nama_gudang ?? null,
                mitra: scrapedMitra || header?.mitra || null,
                materials: mappedMaterials,
            },
        };
    } catch (error: any) {
        actionLogger.error(
            'scrapeSingleOutLensaDetailService error:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Terjadi kesalahan sistem',
        };
    }
}
