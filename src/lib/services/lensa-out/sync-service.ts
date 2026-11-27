import crypto from 'node:crypto';
import { db } from '@/lib/db/db';
import {
    isBeforeCutoffOut,
    isWithinCutoffOut,
    scrapeLensaDetails,
    scrapeLensaHeaders,
} from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { lensaEltRepository } from '@/lib/repositories/lensa-elt.repository';
import {
    type ScraperAction,
    scraperLogRepository,
} from '@/lib/repositories/scraper-log.repository';
import { findMatchingMasterWarehouse, isMasterWarehouse } from '@/lib/warehouse-helper';
import {
    executeWithLensaFallback,
    getActiveWarehousesWithLensaCandidates,
    getWarehouseLensaCandidates,
} from '../lensa-credential-helper';
import { asyncPool } from '../lensa-crypto';
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
        const whTasks = await getActiveWarehousesWithLensaCandidates();

        if (whTasks.length === 0) {
            const errorMsg =
                'Tidak ada warehouse dengan PIC Lensa yang valid untuk melakukan scraping.';
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

        // PHASE 1: SCRAPE HEADERS (Per Gudang via PIC 1 dengan Failback ke PIC 2)
        const headerResults = await asyncPool(5, whTasks, async (task) => {
            try {
                const newHeaders = await executeWithLensaFallback(
                    task.candidates,
                    async (creds) => {
                        const headers = await scrapeLensaHeaders(
                            existingHeaderIds,
                            creds.username,
                            creds.password,
                            perpage
                        );
                        accountResults.push({
                            username: creds.username,
                            phase: 'headers',
                            gudang: task.warehouseName,
                            status: headers.length > 0 ? 'success' : 'no_data',
                            count: headers.length,
                        });
                        return headers.map((h) => ({
                            ...h,
                            scraped_by_username: creds.username,
                            nama_gudang: h.nama_gudang || task.warehouseName,
                        }));
                    },
                    `Out-Lensa[${task.warehouseName}]`
                );
                totalUsersScraped++;
                return newHeaders;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                const isLoginErr =
                    msg.toLowerCase().includes('sesi') || msg.toLowerCase().includes('login');
                accountResults.push({
                    username: task.candidates[0]?.username || 'UNKNOWN',
                    phase: 'headers',
                    gudang: task.warehouseName,
                    status: isLoginErr ? 'login_fail' : 'scrape_fail',
                    count: 0,
                    error: msg,
                });
                actionLogger.error(
                    `Failed to scrape headers for gudang ${task.warehouseName}:`,
                    e instanceof Error ? e : new Error(msg)
                );
                return [];
            }
        });

        const allNewHeaders = headerResults.flat();
        const filteredHeaders = allNewHeaders.filter(
            (h) => isMasterWarehouse(h.nama_gudang) && isWithinCutoffOut(h.tgl_entry)
        );
        const uniqueHeadersMap = new Map();
        for (const h of filteredHeaders) {
            uniqueHeadersMap.set(h.reservation_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        // Ingest new headers ke staging dan proses via Database-Centric ELT (ADR-007)
        if (deduplicatedHeaders.length > 0) {
            const batchId = crypto.randomUUID();
            await lensaEltRepository.insertOutLensaStagingBatch(batchId, deduplicatedHeaders, action);
            const { processedCount } = await lensaEltRepository.processOutLensaStaging(batchId);
            totalInserted += processedCount;
            for (const h of deduplicatedHeaders) {
                existingHeaderIds.push(h.reservation_id);
            }
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
                .select(['id', 'name', 'pic_1', 'pic_2'])
                .execute();

            const groupedHeaders: Record<string, any[]> = {};
            for (const h of headersMissingDetails) {
                const gudang = h.nama_gudang || 'UNKNOWN';
                if (!groupedHeaders[gudang]) groupedHeaders[gudang] = [];
                groupedHeaders[gudang].push(h);
            }

            const userDetailTasks = await Promise.all(
                Object.keys(groupedHeaders).map(async (gudang) => {
                    const matchedWh = findMatchingMasterWarehouse(gudang, whs);
                    const candidates = await getWarehouseLensaCandidates({
                        warehouseId: matchedWh?.id,
                        warehouseName: gudang,
                        includeSystemFallback: false,
                    });
                    if (candidates.length === 0) return null;
                    return {
                        gudang,
                        candidates,
                        headers: groupedHeaders[gudang],
                    };
                })
            ).then((t) => t.filter((item): item is NonNullable<typeof item> => item !== null));

            const detailResults = await asyncPool(5, userDetailTasks, async (task) => {
                const { candidates, headers, gudang } = task;
                try {
                    const details = await executeWithLensaFallback(
                        candidates,
                        async (creds) => {
                            const d = await scrapeLensaDetails(
                                headers,
                                creds.username,
                                creds.password,
                                5
                            );
                            accountResults.push({
                                username: creds.username,
                                phase: 'details',
                                gudang,
                                status: d.length > 0 ? 'success' : 'no_data',
                                count: d.length,
                            });
                            return d;
                        },
                        `Out-Lensa-Detail[${gudang}]`
                    );
                    totalUsersScraped++;
                    return details;
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    const isLoginErr =
                        msg.toLowerCase().includes('sesi') || msg.toLowerCase().includes('login');
                    accountResults.push({
                        username: candidates[0]?.username || 'UNKNOWN',
                        phase: 'details',
                        gudang,
                        status: isLoginErr ? 'login_fail' : 'scrape_fail',
                        count: 0,
                        error: msg,
                    });
                    actionLogger.error(
                        `Failed to scrape details for gudang ${gudang}:`,
                        e instanceof Error ? e : new Error(msg)
                    );
                    return [];
                }
            });

            const allDetails = detailResults.flat();

            if (allDetails.length > 0) {
                const detailPayload = allDetails
                    .filter((d) => d.reservation_id && (d.mitra || (d.materials && d.materials.length > 0)))
                    .map((d) => ({
                        reservation_id: d.reservation_id,
                        mitra: d.mitra,
                        items: d.materials,
                    }));

                if (detailPayload.length > 0) {
                    const detailBatchId = crypto.randomUUID();
                    await lensaEltRepository.insertOutLensaStagingBatch(detailBatchId, detailPayload, action);
                    await lensaEltRepository.processOutLensaStaging(detailBatchId);
                }
            }
        } else {
            totalUsersScraped = whTasks.length;
        }

        // Refresh MViews Lensa secara aman dengan advisory lock
        await lensaEltRepository.refreshLensaMaterializedViewsSafe();

        const summary = {
            totalAccounts: whTasks.length,
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
