/**
 * Nightly deep-sweep WO Lensa scraper (02:00 WIB).
 *
 * - Loops over every active technician NIK per warehouse.
 * - Runs the 5 SO warehouses in parallel.
 * - Each NIK gets up to 3 retries on Lensa network/server failures.
 * - Tolerates irregular WO number formats (1-xxxx, LPxxxx, ...).
 */
import crypto from 'node:crypto';
import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import {
    isRejectedWONumber,
    type RejectedWOLensaItem,
    scrapeWOLensaHeadersByNik,
} from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { lensaEltRepository } from '@/lib/repositories/lensa-elt.repository';
import {
    type ScraperAction,
    scraperLogRepository,
} from '@/lib/repositories/scraper-log.repository';
import { isMasterWarehouse } from '@/lib/warehouse-helper';
import {
    executeWithLensaFallback,
    getActiveWarehousesWithLensaCandidates,
} from '../lensa-credential-helper';
import { asyncPool } from '../lensa-crypto';
import { processRejectedWOLensaItems } from './rollback-service';
import { syncMissingWOLensaDetails } from './sync-service';
import { toISODateString, type WOLensaScrapeOutcome } from './types';

/**
 * Nightly Deep Sweep Scraper untuk WO Lensa Ref Header & Detail (Pukul 02:00 WIB).
 * - Melakukan loop berdasarkan NIK seluruh teknisi aktif per gudang
 * - Berjalan paralel pada 5 instance gudang SO (Karangpilang, Gresik, Lamongan, Bojonegoro, Tuban)
 * - Masing-masing NIK memiliki batas retry 3x jika terjadi kegagalan jaringan/server Lensa
 * - Mengakomodasi nomor WO yang formatnya tidak beraturan (1-xxxx, LPxxxx, dll)
 * - Menyimpan header baru dan menyinkronkan detail yang belum lengkap
 */
export async function executeNightlyWOLensaScrapingByNik(
    action: ScraperAction = 'system'
): Promise<WOLensaScrapeOutcome> {
    try {
        actionLogger.info(
            '[WO-NIGHTLY] Memulai Nightly Deep Sweep WO Lensa berdasarkan NIK teknisi...'
        );

        // 1. Ambil task gudang operasional SO (id 1..5) beserta kandidat Lensa
        const rawWhTasks = await getActiveWarehousesWithLensaCandidates({
            warehouseIds: [1, 2, 3, 4, 5],
        });

        // 2. Ambil NIK seluruh teknisi aktif per gudang
        const activeTechs = await db
            .selectFrom('hr.technicians')
            .select(['nik', 'wh_id'])
            .where('is_active', '=', true)
            .where('wh_id', 'is not', null)
            .execute();

        const techNiksByWhId = new Map<number, string[]>();
        for (const t of activeTechs) {
            if (!t.wh_id || !t.nik) continue;
            const cleanNik = t.nik.trim();
            if (!cleanNik) continue;
            const list = techNiksByWhId.get(t.wh_id) || [];
            if (!list.includes(cleanNik)) {
                list.push(cleanNik);
            }
            techNiksByWhId.set(t.wh_id, list);
        }

        // 3. Ambil daftar existing pemakaian_id non-rejected (batas 10.000)
        const existingHeaders = await db
            .selectFrom('inventory.wo_lensa_header')
            .select(['pemakaian_id'])
            .where(sql<boolean>`UPPER(wo_number) NOT LIKE '%REJECTED%'`)
            .orderBy('created_at', 'desc')
            .limit(10000)
            .execute();
        const existingPemakaianIds = existingHeaders.map((h) => String(h.pemakaian_id));
        const existingSet = new Set<string>(existingPemakaianIds);

        // 4. Susun task per gudang dengan daftar teknisi aktif
        const whTasks = rawWhTasks
            .map((task) => {
                const niks = techNiksByWhId.get(task.warehouseId) || [];
                if (niks.length === 0) {
                    actionLogger.warn(
                        `[WO-NIGHTLY][${task.warehouseName}] Dilewati: Tidak ada teknisi aktif terdaftar.`
                    );
                    return null;
                }
                return {
                    ...task,
                    niks,
                };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);

        if (whTasks.length === 0) {
            return {
                success: false,
                message:
                    'Tidak ada gudang dengan PIC Lensa dan teknisi aktif untuk scraping malam.',
            };
        }

        actionLogger.info(
            `[WO-NIGHTLY] Menjalankan scraping 5 instance gudang secara paralel untuk total ${activeTechs.length} teknisi aktif...`
        );

        // 5. Jalankan scraping paralel 5 instance gudang dengan fallback terpadu
        const allRejectedHeaders: RejectedWOLensaItem[] = [];
        const headerResults = await asyncPool(5, whTasks, async (task) => {
            try {
                actionLogger.info(
                    `[WO-NIGHTLY][${task.warehouseName}] Memulai sweep (${task.niks.length} teknisi)...`
                );
                return await executeWithLensaFallback(
                    task.candidates,
                    async (creds) => {
                        const taskRejected: RejectedWOLensaItem[] = [];
                        const newHeaders = await scrapeWOLensaHeadersByNik(
                            task.niks,
                            existingPemakaianIds,
                            creds.username,
                            creds.password,
                            100,
                            3,
                            taskRejected
                        );
                        if (taskRejected.length > 0) {
                            allRejectedHeaders.push(...taskRejected);
                        }
                        actionLogger.info(
                            `[WO-NIGHTLY][${task.warehouseName}] Selesai PIC ${creds.username} → ${newHeaders.length} headers ditemukan.`
                        );
                        return newHeaders;
                    },
                    `WO-NIGHTLY[${task.warehouseName}]`
                );
            } catch (e: unknown) {
                actionLogger.error(
                    `[WO-NIGHTLY][${task.warehouseName}] Seluruh PIC gagal: ${
                        e instanceof Error ? e.message : e
                    }`
                );
                return [];
            }
        });

        // 6. Rollback & bersihkan data lokal jika ada pemakaian_id yang berubah REJECTED di Lensa
        if (allRejectedHeaders.length > 0) {
            actionLogger.info(
                `[WO-NIGHTLY] Memproses ${allRejectedHeaders.length} WO berstatus REJECTED yang terdeteksi dari Lensa...`
            );
            await processRejectedWOLensaItems(allRejectedHeaders, 'nightly-service');
        }

        const allNewHeaders = headerResults.flat();
        const filteredHeaders = allNewHeaders.filter(
            (h) => !isRejectedWONumber(h.wo_number) && isMasterWarehouse(h.nama_gudang)
        );

        const uniqueHeadersMap = new Map<string, (typeof filteredHeaders)[number]>();
        for (const h of filteredHeaders) {
            uniqueHeadersMap.set(String(h.pemakaian_id), h);
        }
        const deduplicatedHeaders = Array.from(uniqueHeadersMap.values());

        // 7. Simpan / Perbarui header ke database via Database-Centric ELT (ADR-007)
        let totalInserted = 0;
        if (deduplicatedHeaders.length > 0) {
            const batchId = crypto.randomUUID();
            await lensaEltRepository.insertWOLensaStagingBatch(batchId, deduplicatedHeaders, action);
            const { processedCount } = await lensaEltRepository.processWOLensaStaging(batchId);
            totalInserted += processedCount;
        }

        // 8. Sinkronisasi detail material untuk header yang belum memiliki detail
        const syncedDetailsCount = await syncMissingWOLensaDetails();
        actionLogger.info(
            `[WO-NIGHTLY] Sinkronisasi detail selesai: ${syncedDetailsCount} baris material tersimpan.`
        );

        const resumeResult =
            totalInserted > 0
                ? `Sukses ${totalInserted} data WO baru (Sweep Malam NIK)`
                : 'Selesai: Tidak ada data WO baru (Sweep Malam NIK)';

        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: resumeResult,
            })
            .catch((err) => {
                actionLogger.warn('[WO-NIGHTLY] Gagal mencatat scraper_cronjob_log:', err);
            });

        return {
            success: true,
            message: `Nightly sweep selesai. ${totalInserted} data WO Lensa baru berhasil disimpan.`,
            newCount: totalInserted,
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Nightly WO NIK scraping error:',
            error instanceof Error ? error : new Error(String(error))
        );
        const errMsg =
            error instanceof Error
                ? error.message
                : 'Terjadi kesalahan saat nightly sweep WO Lensa.';
        await scraperLogRepository
            .insertLog({
                scraper_type: 'wo_lensa',
                action,
                resume_result: `Gagal: ${errMsg} (Sweep Malam NIK)`,
            })
            .catch((err) => {
                actionLogger.warn('[WO-NIGHTLY] Gagal mencatat scraper_cronjob_log:', err);
            });
        return {
            success: false,
            message: errMsg,
        };
    }
}
