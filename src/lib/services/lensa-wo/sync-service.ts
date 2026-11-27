/**
 * WO Lensa header + detail synchronization service.
 *
 * Runs the regular (on-demand / scheduled) scrape: pulls headers for every
 * warehouse that has a Lensa-credited PIC, then fills in missing material rows.
 * Free of Next.js request dependencies so it can run from the PM2 worker or CLI.
 */
import crypto from 'node:crypto';
import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import {
    isRejectedWONumber,
    type RejectedWOLensaItem,
    scrapeWOLensaDetails,
    scrapeWOLensaHeaders,
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
import { processRejectedWOLensaItems } from './rollback-service';
import { toISODateString, type WOLensaScrapeOutcome } from './types';

/**
 * Service murni untuk eksekusi scraping WO Lensa (headers + details).
 * Bebas dari ketergantungan HTTP request Next.js (bisa dijalankan via Worker PM2 atau CLI).
 */
export async function executeWOLensaScraping(
    _perpage?: number,
    _fullLoop: boolean = false,
    action: ScraperAction = 'system'
): Promise<WOLensaScrapeOutcome> {
    const perpage = 100;
    try {
        const whTasks = await getActiveWarehousesWithLensaCandidates();

        if (whTasks.length === 0) {
            return {
                success: false,
                message:
                    'Tidak ada warehouse dengan PIC Lensa yang valid untuk melakukan scraping.',
            };
        }

        // Ambil header terkini non-rejected dengan batas 10.000 untuk mencegah unbounded memory scan di RAM
        const existingHeaders = await db
            .selectFrom('inventory.wo_lensa_header')
            .select(['pemakaian_id'])
            .where(sql<boolean>`UPPER(wo_number) NOT LIKE '%REJECTED%'`)
            .orderBy('created_at', 'desc')
            .limit(10000)
            .execute();
        const existingPemakaianIds = existingHeaders.map((h) => String(h.pemakaian_id));

        let totalInserted = 0;
        let totalUsersScraped = 0;
        const allRejectedHeaders: RejectedWOLensaItem[] = [];

        const headerResults = await asyncPool(5, whTasks, async (task) => {
            try {
                const newHeaders = await executeWithLensaFallback(
                    task.candidates,
                    async (creds) => {
                        const taskRejected: RejectedWOLensaItem[] = [];
                        const headers = await scrapeWOLensaHeaders(
                            existingPemakaianIds,
                            creds.username,
                            creds.password,
                            perpage,
                            false,
                            taskRejected
                        );
                        if (taskRejected.length > 0) {
                            allRejectedHeaders.push(...taskRejected);
                        }
                        actionLogger.info(
                            `[WO][${task.warehouseName}] PIC ${creds.username} → ${headers.length} headers`
                        );
                        return headers.map((h) => ({
                            ...h,
                            scraped_by_username: creds.username,
                            nama_gudang: h.nama_gudang || task.warehouseName,
                        }));
                    },
                    `WO-Lensa[${task.warehouseName}]`
                );
                totalUsersScraped++;
                return newHeaders;
            } catch (e: unknown) {
                actionLogger.error(
                    `[WO][${task.warehouseName}] Seluruh PIC gagal: ${
                        e instanceof Error ? e.message : e
                    }`
                );
                return [];
            }
        });

        // 1. Rollback & bersihkan data lokal jika ada pemakaian_id yang berubah REJECTED di Lensa
        if (allRejectedHeaders.length > 0) {
            actionLogger.info(
                `[syncWOLensa] Memproses ${allRejectedHeaders.length} WO berstatus REJECTED yang terdeteksi dari Lensa...`
            );
            await processRejectedWOLensaItems(allRejectedHeaders, 'sync-service');
        }

        const allNewHeaders = headerResults.flat();

        const filteredHeaders = allNewHeaders.filter(
            (h) => !isRejectedWONumber(h.wo_number) && isMasterWarehouse(h.nama_gudang)
        );

        const uniqueHeadersMap = new Map<string, (typeof filteredHeaders)[number]>();
        for (const h of filteredHeaders) {
            uniqueHeadersMap.set(h.pemakaian_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        // Ingest headers ke staging dan proses via Database-Centric ELT (ADR-007)
        if (deduplicatedHeaders.length > 0) {
            const batchId = crypto.randomUUID();
            await lensaEltRepository.insertWOLensaStagingBatch(batchId, deduplicatedHeaders, action);
            const { processedCount } = await lensaEltRepository.processWOLensaStaging(batchId);
            totalInserted += processedCount;
            for (const h of deduplicatedHeaders) {
                existingPemakaianIds.push(String(h.pemakaian_id));
            }
        }

        await syncMissingWOLensaDetails();

        const resumeResult =
            totalInserted > 0
                ? `Sukses ${totalInserted} data WO baru (${totalUsersScraped} akun)`
                : `Selesai: Tidak ada data WO baru (${totalUsersScraped} akun)`;

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
            newCount: totalInserted,
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

/**
 * Sinkronisasi detail material untuk header-header WO Lensa yang belum memiliki baris material di wo_lensa_list.
 */
export async function syncMissingWOLensaDetails(): Promise<number> {
    const headersMissingDetails = await db
        .selectFrom('inventory.wo_lensa_header as h')
        .leftJoin('inventory.wo_lensa_list as l', 'l.header_id', 'h.id')
        .select(['h.id', 'h.pemakaian_id', 'h.nama_gudang', 'h.type'])
        .where('l.id', 'is', null)
        .execute();

    if (headersMissingDetails.length === 0) return 0;

    const whs = await db
        .selectFrom('inventory.mas_wh')
        .select(['id', 'name', 'pic_1', 'pic_2'])
        .execute();

    const groupedHeaders: Record<string, typeof headersMissingDetails> = {};
    for (const h of headersMissingDetails) {
        const gudang = h.nama_gudang || 'UNKNOWN';
        if (!groupedHeaders[gudang]) groupedHeaders[gudang] = [];
        groupedHeaders[gudang].push(h);
    }

    const tasks = await Promise.all(
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

    let insertedDetailsCount = 0;

    const detailResults = await asyncPool(5, tasks, async (task) => {
        const { candidates, headers, gudang } = task;
        try {
            return await executeWithLensaFallback(
                candidates,
                async (creds) => {
                    return await scrapeWOLensaDetails(
                        headers.map((h) => ({
                            id: Number(h.id),
                            pemakaian_id: String(h.pemakaian_id),
                            type: (h as { type?: string | null }).type || 'assurance',
                        })),
                        creds.username,
                        creds.password,
                        5
                    );
                },
                `WO-Lensa-Detail[${gudang}]`
            );
        } catch (e: unknown) {
            actionLogger.error(
                `Failed to scrape details for WO gudang ${gudang}:`,
                e instanceof Error ? e : new Error(String(e))
            );
            return [];
        }
    });

    const allDetails = detailResults.flat();

    if (allDetails.length > 0) {
        const detailPayload = allDetails
            .filter((d) => d.pemakaian_id && d.materials && d.materials.length > 0)
            .map((d) => ({
                pemakaian_id: d.pemakaian_id,
                items: d.materials,
            }));

        if (detailPayload.length > 0) {
            const detailBatchId = crypto.randomUUID();
            await lensaEltRepository.insertWOLensaStagingBatch(detailBatchId, detailPayload, 'system');
            const { processedCount } = await lensaEltRepository.processWOLensaStaging(detailBatchId);
            insertedDetailsCount += processedCount;
        }
    }

    // Refresh MViews Lensa secara aman dengan advisory lock
    await lensaEltRepository.refreshLensaMaterializedViewsSafe();

    return insertedDetailsCount;
}
