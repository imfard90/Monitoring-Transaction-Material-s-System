/**
 * WO Lensa header + detail synchronization service.
 *
 * Runs the regular (on-demand / scheduled) scrape: pulls headers for every
 * warehouse that has a Lensa-credited PIC, then fills in missing material rows.
 * Free of Next.js request dependencies so it can run from the PM2 worker or CLI.
 */
import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import {
    isRejectedWONumber,
    scrapeWOLensaDetails,
    scrapeWOLensaHeaders,
} from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { resolveMaterialAlias } from '@/lib/material-alias-helper';
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

        const headerResults = await asyncPool(5, whTasks, async (task) => {
            try {
                const newHeaders = await executeWithLensaFallback(
                    task.candidates,
                    async (creds) => {
                        const headers = await scrapeWOLensaHeaders(
                            existingPemakaianIds,
                            creds.username,
                            creds.password,
                            perpage
                        );
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

        const allNewHeaders = headerResults.flat();

        const filteredHeaders = allNewHeaders.filter(
            (h) => !isRejectedWONumber(h.wo_number) && isMasterWarehouse(h.nama_gudang)
        );

        const uniqueHeadersMap = new Map<string, (typeof filteredHeaders)[number]>();
        for (const h of filteredHeaders) {
            uniqueHeadersMap.set(h.pemakaian_id, h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

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
            const pemakaianIds = deduplicatedHeaders
                .map((h) => (h.pemakaian_id ? String(h.pemakaian_id).trim() : ''))
                .filter(Boolean);
            const woNumbers = deduplicatedHeaders
                .map((h) => (h.wo_number ? String(h.wo_number).trim() : ''))
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
                            pemakaian_id: Number(pId) || sql`CAST(${pId} AS BIGINT)`,
                            gi_number: h.gi_number,
                            nama_gudang: h.nama_gudang,
                            nik_pemakai: h.nik_pemakai,
                            tanggal_update: h.tanggal_update,
                            formatted_date: toISODateString(h.formatted_date),
                            type: h.type,
                            wbs: h.wbs,
                            wo_number: h.wo_number,
                            rekon_check: isRekonCheck,
                        })
                        .onConflict((oc) =>
                            oc.column('pemakaian_id').doUpdateSet({
                                wo_number: sql`COALESCE(EXCLUDED.wo_number, inventory.wo_lensa_header.wo_number)`,
                                nama_gudang: sql`COALESCE(EXCLUDED.nama_gudang, inventory.wo_lensa_header.nama_gudang)`,
                                nik_pemakai: sql`COALESCE(EXCLUDED.nik_pemakai, inventory.wo_lensa_header.nik_pemakai)`,
                                gi_number: sql`COALESCE(EXCLUDED.gi_number, inventory.wo_lensa_header.gi_number)`,
                                tanggal_update: sql`COALESCE(EXCLUDED.tanggal_update, inventory.wo_lensa_header.tanggal_update)`,
                                formatted_date: sql`COALESCE(EXCLUDED.formatted_date, inventory.wo_lensa_header.formatted_date)`,
                                type: sql`COALESCE(EXCLUDED.type, inventory.wo_lensa_header.type)`,
                                wbs: sql`COALESCE(EXCLUDED.wbs, inventory.wo_lensa_header.wbs)`,
                                rekon_check: sql`COALESCE(EXCLUDED.rekon_check, inventory.wo_lensa_header.rekon_check)`,
                            })
                        )
                        .execute();
                    totalInserted++;
                    existingPemakaianIds.push(String(h.pemakaian_id));
                }
            });
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
                        creds.password
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
        await db.transaction().execute(async (trx) => {
            for (const d of allDetails) {
                if (d.materials && d.materials.length > 0) {
                    const materialInserts = d.materials.map(
                        (m: Record<string, string | number>) => {
                            const rawMaterialId = (m['ID MATERIAL'] as string)?.trim() || null;
                            const materialDesc = (m['NAMA MATERIAL'] as string) || null;

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
                                        `[WO Lensa] Material tanpa ID dan tidak ada alias: "${materialDesc}" (header ${d.header_id}).`
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
                    insertedDetailsCount += materialInserts.length;
                }
            }
        });
    }

    return insertedDetailsCount;
}
