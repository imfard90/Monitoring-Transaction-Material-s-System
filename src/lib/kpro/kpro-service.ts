import fs from 'node:fs/promises';
import path from 'node:path';
import { kproLogger } from '@/lib/logger';
import { withLock } from '@/lib/redis-lock';
import { kproRepository } from '@/lib/repositories/kpro.repository';
import { checkIntranetConnection, getValidCookies } from './kpro-auth';
import { KPRO_CONFIG } from './kpro-config';
import { downloadWitelFile } from './kpro-downloader';
import { parseKproHtmlFile } from './kpro-parser';
import type { KproSyncSummary, KproWitelSyncResult } from './kpro-types';

const formatDate = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Menjalankan satu siklus sinkronisasi data K-PRO secara lengkap.
 * Mengeksekusi pengunduhan dan pemrosesan seluruh witel secara PARALEL (konkuren)
 * untuk memaksimalkan kecepatan transfer data.
 */
export async function executeKproSync(options?: {
    forceLogin?: boolean;
    witels?: string[];
    rollingDays?: number;
}): Promise<KproSyncSummary> {
    const tStart = Date.now();
    const now = new Date();
    const days = options?.rollingDays ?? KPRO_CONFIG.rollingDays;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const startStr = formatDate(startDate);
    const endStr = formatDate(now);
    const targetWitels = options?.witels ?? [...KPRO_CONFIG.witels];

    kproLogger.info('====================================================');
    kproLogger.info(`[KPRO-SERVICE] Starting K-PRO Sync (${startStr} to ${endStr})`);
    kproLogger.info(
        `[KPRO-SERVICE] Target Witels (${targetWitels.length} concurrent instances): ${targetWitels.join(', ')}`
    );
    kproLogger.info('====================================================');

    const lockResult = await withLock(
        KPRO_CONFIG.redisKeys.lock,
        KPRO_CONFIG.timeouts.lockTtlSeconds,
        async () => {
            // 1. Periksa koneksi intranet
            const isIntranetAvailable = await checkIntranetConnection();
            if (!isIntranetAvailable) {
                throw new Error('K-PRO intranet is unreachable. Check VPN/network connection.');
            }

            // 2. Dapatkan sesi cookies yang valid (dibagi untuk semua instance paralel)
            const cookies = await getValidCookies(options?.forceLogin);

            kproLogger.info(
                `[KPRO-SERVICE] Spawning ${targetWitels.length} concurrent download & ETL pipelines...`
            );

            // 3. Eksekusi pengunduhan dan ETL untuk SEMUA witel secara PARALEL
            const witelPromises = targetWitels.map(
                async (witel): Promise<KproWitelSyncResult> => {
                    const witelStartTime = Date.now();
                    kproLogger.info(`[KPRO-SERVICE] [Worker-${witel}] Starting parallel pipeline...`);

                    let downloadedFilePath = '';
                    let jobId = 0;

                    try {
                        // Step A: Unduh file laporan witel secara paralel
                        const downloadResult = await downloadWitelFile(
                            cookies,
                            witel,
                            startStr,
                            endStr,
                            KPRO_CONFIG.tempDir
                        );
                        downloadedFilePath = downloadResult.filePath;
                        const fileName = path.basename(downloadedFilePath);

                        // Step B: Buat entri job di etl.import_jobs
                        jobId = await kproRepository.createImportJob(
                            fileName,
                            downloadResult.fileSize
                        );
                        kproLogger.info(
                            `[KPRO-SERVICE] [Worker-${witel}] Created import job #${jobId}`
                        );

                        // Step C: Parse data HTML & filter status COMPWORK
                        const parsed = await parseKproHtmlFile(downloadedFilePath);

                        // Step D: Batch UPSERT data COMPWORK ke public.data_kpro
                        kproLogger.info(
                            `[KPRO-SERVICE] [Worker-${witel}] Upserting ${parsed.compworkRows} COMPWORK records to public.data_kpro...`
                        );
                        const upsertedCount = await kproRepository.batchUpsertCompwork(
                            parsed.records,
                            KPRO_CONFIG.batchSize
                        );

                        // Step E: Perbarui status import_job ke COMPLETED
                        await kproRepository.updateImportJob(jobId, 'COMPLETED', {
                            totalRows: parsed.totalRows,
                            processedRows: parsed.totalRows,
                            successRows: upsertedCount,
                            errorRows: 0,
                        });

                        const witelDuration = Date.now() - witelStartTime;
                        kproLogger.info(
                            `[KPRO-SERVICE] [Worker-${witel}] Finished in ${(witelDuration / 1000).toFixed(1)}s: ${upsertedCount} rows upserted.`
                        );

                        return {
                            witel,
                            filePath: downloadedFilePath,
                            fileSize: downloadResult.fileSize,
                            jobId,
                            totalRows: parsed.totalRows,
                            compworkRows: upsertedCount,
                            durationMs: witelDuration,
                        };
                    } catch (witelErr) {
                        const errorMsg =
                            witelErr instanceof Error ? witelErr.message : String(witelErr);
                        kproLogger.error(
                            `[KPRO-SERVICE] [Worker-${witel}] Pipeline failed: ${errorMsg}`
                        );

                        if (jobId > 0) {
                            await kproRepository
                                .updateImportJob(jobId, 'FAILED', {
                                    errorRows: 1,
                                })
                                .catch(() => {});
                        }

                        return {
                            witel,
                            filePath: downloadedFilePath,
                            fileSize: 0,
                            jobId,
                            totalRows: 0,
                            compworkRows: 0,
                            durationMs: Date.now() - witelStartTime,
                            error: errorMsg,
                        };
                    } finally {
                        // Step F: Bersihkan file unduhan temporer
                        if (downloadedFilePath) {
                            await fs.unlink(downloadedFilePath).catch(() => {});
                        }
                    }
                }
            );

            // Menunggu seluruh pipeline witel paralel selesai (terisolasi, tidak saling membatalkan)
            const settledResults = await Promise.allSettled(witelPromises);
            const witelResults: KproWitelSyncResult[] = [];
            let totalCompworkUpserted = 0;

            for (const res of settledResults) {
                if (res.status === 'fulfilled') {
                    witelResults.push(res.value);
                    totalCompworkUpserted += res.value.compworkRows;
                } else {
                    kproLogger.error(
                        `[KPRO-SERVICE] Unexpected parallel worker crash: ${String(res.reason)}`
                    );
                }
            }

            // 4. Catat riwayat ke upload_logs
            if (totalCompworkUpserted > 0) {
                await kproRepository.recordUploadLog(totalCompworkUpserted);
            }

            const totalDurationMs = Date.now() - tStart;
            kproLogger.info('====================================================');
            kproLogger.info(
                `[KPRO-SERVICE] Parallel sync completed in ${(totalDurationMs / 1000).toFixed(1)}s`
            );
            kproLogger.info(`[KPRO-SERVICE] Total COMPWORK upserted: ${totalCompworkUpserted}`);
            kproLogger.info('====================================================');

            return {
                success: true,
                startDate: startStr,
                endDate: endStr,
                witels: witelResults,
                totalCompworkUpserted,
                totalDurationMs,
            };
        }
    );

    if (!lockResult.acquired) {
        kproLogger.warn('[KPRO-SERVICE] Another K-PRO sync is already in progress. Skipping run.');
        return {
            success: false,
            startDate: startStr,
            endDate: endStr,
            witels: [],
            totalCompworkUpserted: 0,
            totalDurationMs: Date.now() - tStart,
            error: 'Sync already running (Redis lock held by another process)',
        };
    }

    return lockResult.result;
}
