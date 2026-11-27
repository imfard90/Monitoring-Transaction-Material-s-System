import fs from 'node:fs/promises';
import path from 'node:path';
import { kproLogger } from '@/lib/logger';
import { withLock } from '@/lib/redis-lock';
import { kproRepository } from '@/lib/repositories/kpro.repository';
import { scraperLogRepository } from '@/lib/repositories/scraper-log.repository';
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

                            // Step C: Parse data HTML & ekstrak baris mentah
                            const parsed = await parseKproHtmlFile(downloadedFilePath);
                            witelTotalRows += parsed.totalRows;

                            // Step D: Ingest baris mentah ke etl.staging_data_kpro_raw
                            kproLogger.info(
                                `[KPRO-SERVICE] [Worker-${witel}] (${psb}) Ingesting ${parsed.rawRecords.length} raw rows to etl.staging_data_kpro_raw...`
                            );
                            await kproRepository.insertRawStagingBatch(
                                jobId,
                                parsed.rawRecords,
                                1000
                            );

                            // Step E: Trigger Stored Procedure etl.sp_process_kpro_staging di database
                            kproLogger.info(
                                `[KPRO-SERVICE] [Worker-${witel}] (${psb}) Executing etl.sp_process_kpro_staging for job #${jobId}...`
                            );
                            const spResult = await kproRepository.callProcessKproStaging(jobId);
                            witelTotalUpserted += spResult.compworkUpserted;

                            processedPsbs.push(`${psb}: ${spResult.compworkUpserted} rows`);

                            const psbDuration = Date.now() - psbStartTime;
                            kproLogger.info(
                                `[KPRO-SERVICE] [Worker-${witel}] (${psb}) Finished in ${(psbDuration / 1000).toFixed(1)}s: ${spResult.compworkUpserted} rows upserted from ${spResult.totalStaging} staging rows.`
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

            // 4. Catat riwayat ke upload_logs & inventory.scraper_cronjob_log (Improvement 1)
            if (totalCompworkUpserted > 0) {
                await kproRepository.recordUploadLog(totalCompworkUpserted);
            }

            const resumeResult =
                totalCompworkUpserted > 0
                    ? `Sukses ${totalCompworkUpserted} data K-PRO COMPWORK baru (${witelResults.length} witel)`
                    : `Selesai: Tidak ada data K-PRO COMPWORK baru (${witelResults.length} witel)`;

            await scraperLogRepository
                .insertLog({
                    scraper_type: 'kpro',
                    action: 'system',
                    resume_result: resumeResult,
                })
                .catch((err) => {
                    kproLogger.warn('[KPRO-SERVICE] Gagal mencatat scraper_cronjob_log:', err);
                });

            // 5. Trigger lock-safe refresh Materialized View (Improvement 3: Anti-bentrok)
            if (totalCompworkUpserted > 0) {
                kproLogger.info(
                    '[KPRO-SERVICE] Triggering lock-safe refresh for analytics.mv_kpro_rekon_summary...'
                );
                await kproRepository
                    .refreshKproMaterializedViewSafe()
                    .then((refreshed) => {
                        kproLogger.info(
                            `[KPRO-SERVICE] MView refresh finished (executed: ${refreshed})`
                        );
                    })
                    .catch((err) => {
                        kproLogger.warn('[KPRO-SERVICE] MView refresh skipped gracefully:', err);
                    });
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
