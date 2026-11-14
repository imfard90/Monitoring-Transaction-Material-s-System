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
            // 1. Periksa koneksi intranet terlebih dahulu (Fail-Fast jika jaringan mati)
            const isIntranetAvailable = await checkIntranetConnection();
            if (!isIntranetAvailable) {
                kproLogger.warn(
                    '[KPRO-SERVICE] Koneksi intranet K-PRO tidak dapat dijangkau. Sinkronisasi dibatalkan tanpa retry karena memerlukan perbaikan jaringan (VPN/LAN).'
                );
                return {
                    success: false,
                    startDate: startStr,
                    endDate: endStr,
                    witels: [],
                    totalCompworkUpserted: 0,
                    totalDurationMs: Date.now() - tStart,
                    error: 'NETWORK_UNREACHABLE: Jaringan intranet K-PRO tidak dapat dijangkau (perlu perbaikan koneksi VPN/LAN)',
                };
            }

            // 2. Dapatkan sesi cookies yang valid (cek cache Redis/file terlebih dahulu, tanpa Playwright jika masih aktif)
            const cookies = await getValidCookies(options?.forceLogin);

            kproLogger.info(
                `[KPRO-SERVICE] Spawning ${targetWitels.length} concurrent witel instances (processing PSB: ${KPRO_CONFIG.psbTypes.join(', ')})...`
            );

            // 3. Eksekusi pengunduhan dan ETL untuk 3 witel secara PARALEL (konkuren tetap 3)
            // Setiap instance witel memproses 2 PSB (CREATE lalu PDA) secara sekuensial
            const witelPromises = targetWitels.map(
                async (witel): Promise<KproWitelSyncResult> => {
                    const witelStartTime = Date.now();
                    kproLogger.info(`[KPRO-SERVICE] [Worker-${witel}] Starting parallel pipeline...`);

                    let witelTotalUpserted = 0;
                    let witelTotalRows = 0;
                    let totalFileSize = 0;
                    let lastJobId = 0;
                    let lastFilePath = '';
                    const processedPsbs: string[] = [];

                    for (const psb of KPRO_CONFIG.psbTypes) {
                        const psbStartTime = Date.now();
                        let downloadedFilePath = '';
                        let jobId = 0;

                        try {
                            // Step A: Unduh file laporan witel + PSB
                            const downloadResult = await downloadWitelFile(
                                cookies,
                                witel,
                                psb,
                                startStr,
                                endStr,
                                KPRO_CONFIG.tempDir
                            );
                            downloadedFilePath = downloadResult.filePath;
                            lastFilePath = downloadedFilePath;
                            totalFileSize += downloadResult.fileSize;
                            const fileName = path.basename(downloadedFilePath);

                            // Step B: Buat entri job di etl.import_jobs
                            jobId = await kproRepository.createImportJob(
                                fileName,
                                downloadResult.fileSize
                            );
                            lastJobId = jobId;
                            kproLogger.info(
                                `[KPRO-SERVICE] [Worker-${witel}] (${psb}) Created import job #${jobId}`
                            );

                            // Step C: Parse data HTML & filter status COMPWORK
                            const parsed = await parseKproHtmlFile(downloadedFilePath);
                            witelTotalRows += parsed.totalRows;

                            // Step D: Batch UPSERT data COMPWORK ke public.data_kpro
                            kproLogger.info(
                                `[KPRO-SERVICE] [Worker-${witel}] (${psb}) Upserting ${parsed.compworkRows} COMPWORK records to public.data_kpro...`
                            );
                            const upsertedCount = await kproRepository.batchUpsertCompwork(
                                parsed.records,
                                KPRO_CONFIG.batchSize
                            );
                            witelTotalUpserted += upsertedCount;

                            // Step E: Perbarui status import_job ke COMPLETED
                            await kproRepository.updateImportJob(jobId, 'COMPLETED', {
                                totalRows: parsed.totalRows,
                                processedRows: parsed.totalRows,
                                successRows: upsertedCount,
                                errorRows: 0,
                            });

                            processedPsbs.push(`${psb}: ${upsertedCount} rows`);

                            const psbDuration = Date.now() - psbStartTime;
                            kproLogger.info(
                                `[KPRO-SERVICE] [Worker-${witel}] (${psb}) Finished in ${(psbDuration / 1000).toFixed(1)}s: ${upsertedCount} rows upserted.`
                            );
                        } catch (psbErr) {
                            const errorMsg =
                                psbErr instanceof Error ? psbErr.message : String(psbErr);
                            kproLogger.error(
                                `[KPRO-SERVICE] [Worker-${witel}] (${psb}) Pipeline failed: ${errorMsg}`
                            );

                            if (jobId > 0) {
                                await kproRepository
                                    .updateImportJob(jobId, 'FAILED', {
                                        errorRows: 1,
                                    })
                                    .catch(() => {});
                            }
                            throw psbErr;
                        } finally {
                            // Step F: Bersihkan file unduhan temporer
                            if (downloadedFilePath) {
                                await fs.unlink(downloadedFilePath).catch(() => {});
                            }
                        }
                    }

                    const witelDuration = Date.now() - witelStartTime;
                    kproLogger.info(
                        `[KPRO-SERVICE] [Worker-${witel}] Finished all PSBs in ${(witelDuration / 1000).toFixed(1)}s: Total ${witelTotalUpserted} rows upserted (${processedPsbs.join(', ')}).`
                    );

                    return {
                        witel,
                        filePath: lastFilePath,
                        fileSize: totalFileSize,
                        jobId: lastJobId,
                        totalRows: witelTotalRows,
                        compworkRows: witelTotalUpserted,
                        durationMs: witelDuration,
                    };
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
