/**
 * Bulk Stock Scraper Service (Architecture Option B)
 *
 * Pola Eksekusi:
 * - 1 Instance BrowserContext per 1 Gudang (Akun Lensa PIC masing-masing, bebas bentrok sesi).
 * - Multi-Gudang berjalan Paralel (Promise.all).
 * - Di dalam 1 Gudang: Micro-pool (2 tab paralel) memproses 10 NIK secara bergantian.
 * - Login dilakukan 1 kali per context gudang, tab di-reuse tanpa overhead context startup.
 */

import { sql } from 'kysely';
import { decryptLensaPassword } from '@/lib/crypto/decrypt-lensa';
import { db } from '@/lib/db/db';
import { scrapeStockTeknisiOnPage, setupContext } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

export interface ScrapingResult {
    nik: string;
    status: 'success' | 'failed';
    error?: string;
    warehouseId?: number;
    warehouseName?: string;
}

export interface WarehouseScrapeSummary {
    warehouseId: number;
    warehouseName: string;
    total: number;
    success: number;
    failed: number;
}

export interface BulkScrapingOptions {
    /** Jumlah NIK teknisi per gudang (default: 10) */
    niksPerWarehouse?: number;
    /** Concurrency tab worker di dalam satu gudang (default: 2, Opsi B) */
    concurrencyPerWarehouse?: number;
    /** Legacy parameter: total batch size (default: 50, dibagi rata ke gudang) */
    batchSize?: number;
    offset?: number;
}

export interface BulkScrapingResult {
    total: number;
    success: number;
    failed: number;
    details: ScrapingResult[];
    byWarehouse?: WarehouseScrapeSummary[];
}

/**
 * Concurrency Limiter Pool (Async Pool)
 */
async function asyncPool<T, R>(
    poolLimit: number,
    array: T[],
    iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
    const ret: Promise<R>[] = [];
    const executing: Promise<void>[] = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);

        if (poolLimit <= array.length) {
            const e: Promise<void> = p.then(() => {
                executing.splice(executing.indexOf(e), 1);
            });
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}

/**
 * Mengambil kredensial akun Lensa dari PIC gudang (PIC 1 fallback PIC 2)
 */
async function getWarehouseLensaCredentials(pic1Nik: string | null, pic2Nik: string | null) {
    for (const picNik of [pic1Nik, pic2Nik]) {
        if (!picNik) continue;

        const picUser = await db
            .selectFrom('auth.user')
            .select([
                sql<string | null>`lensa_acount->>'username'`.as('lensa_username'),
                sql<string | null>`lensa_acount->>'password'`.as('lensa_password'),
            ])
            .where('nik', '=', picNik)
            .where(sql`lensa_acount->>'username'`, 'is not', null)
            .where(sql`lensa_acount->>'password'`, 'is not', null)
            .executeTakeFirst();

        if (picUser?.lensa_username && picUser?.lensa_password) {
            try {
                const decrypted = decryptLensaPassword(picUser.lensa_password);
                return {
                    username: picUser.lensa_username,
                    password: decrypted,
                    picNik,
                };
            } catch (err) {
                actionLogger.error(
                    `[BulkScrape] Gagal mendekripsi password Lensa untuk PIC ${picNik}:`,
                    err instanceof Error ? err : new Error(String(err))
                );
            }
        }
    }
    return null;
}

interface WarehouseWorkerParam {
    warehouseId: number;
    warehouseName: string;
    username: string;
    password: string;
    technicians: Array<{ nik: string; name: string }>;
    concurrency: number;
}

/**
 * Worker untuk 1 gudang:
 * - Membuka 1 BrowserContext tersendiri dengan sesi Lensa PIC gudang tersebut.
 * - Memproses NIK teknisi dengan micro-pool 2 tab concurrent.
 * - Langsung mengupdate hasil scrape ke database hr.technicians.ref_intech_lensa.
 */
async function scrapeWarehouseWorker(param: WarehouseWorkerParam): Promise<ScrapingResult[]> {
    const { warehouseId, warehouseName, username, password, technicians, concurrency } = param;
    actionLogger.info(
        `[BulkScrape] Memulai worker gudang ${warehouseName} (id=${warehouseId}) untuk ${technicians.length} teknisi`
    );

    let context: any = null;

    try {
        const setup = await setupContext(username, password);
        context = setup.context;
        const { page: authPage, performLogin, sessionKey } = setup;

        // Pastikan context dalam keadaan terautentikasi
        if (authPage.url().includes('login')) {
            await performLogin(authPage);
        }
        await authPage.close().catch(() => {});

        // Micro-pool concurrency di dalam context gudang (Opsi B: default 2 tab)
        const results = await asyncPool(concurrency, technicians, async (tech) => {
            if (!context) {
                return {
                    nik: tech.nik,
                    status: 'failed' as const,
                    error: 'Browser context tidak tersedia',
                    warehouseId,
                    warehouseName,
                };
            }

            const page = await context.newPage();
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const scraped = await scrapeStockTeknisiOnPage(page, tech.nik);

                    // Simpan sukses ke DB
                    await db
                        .updateTable('hr.technicians')
                        .set({
                            ref_intech_lensa: sql`${JSON.stringify({
                                status: 'success',
                                scraped_at: new Date().toISOString(),
                                error_message: null,
                                materials: scraped.materials,
                            })}::jsonb`,
                        })
                        .where('nik', '=', tech.nik)
                        .execute();

                    actionLogger.info(
                        `[BulkScrape] Sukses NIK ${tech.nik} (${warehouseName}) - attempt ${attempt}`
                    );
                    await page.close().catch(() => {});
                    return {
                        nik: tech.nik,
                        status: 'success' as const,
                        warehouseId,
                        warehouseName,
                    };
                } catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    actionLogger.warn(
                        `[BulkScrape] Gagal NIK ${tech.nik} (${warehouseName}) attempt ${attempt}/2: ${lastError.message}`
                    );

                    if (attempt < 2) {
                        // Jika sesi login terputus saat bernavigasi
                        if (page.url().includes('login')) {
                            await redis.del(sessionKey);
                            await performLogin(page);
                        }
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                }
            }

            await page.close().catch(() => {});

            const errorMsg = lastError?.message || 'Scrape gagal';
            // Simpan status gagal ke DB
            await db
                .updateTable('hr.technicians')
                .set({
                    ref_intech_lensa: sql`${JSON.stringify({
                        status: 'failed',
                        scraped_at: new Date().toISOString(),
                        error_message: errorMsg,
                        materials: [],
                    })}::jsonb`,
                })
                .where('nik', '=', tech.nik)
                .execute();

            return {
                nik: tech.nik,
                status: 'failed' as const,
                error: errorMsg,
                warehouseId,
                warehouseName,
            };
        });

        return results;
    } catch (err) {
        actionLogger.error(
            `[BulkScrape] Fatal error context gudang ${warehouseName}:`,
            err instanceof Error ? err : new Error(String(err))
        );

        const errorMsg = err instanceof Error ? err.message : 'Koneksi akun gudang gagal';
        // Simpan status gagal untuk semua teknisi di gudang ini
        for (const tech of technicians) {
            await db
                .updateTable('hr.technicians')
                .set({
                    ref_intech_lensa: sql`${JSON.stringify({
                        status: 'failed',
                        scraped_at: new Date().toISOString(),
                        error_message: errorMsg,
                        materials: [],
                    })}::jsonb`,
                })
                .where('nik', '=', tech.nik)
                .execute();
        }

        return technicians.map((tech) => ({
            nik: tech.nik,
            status: 'failed' as const,
            error: errorMsg,
            warehouseId,
            warehouseName,
        }));
    } finally {
        if (context) {
            await context.close().catch(() => {});
        }
    }
}

/**
 * Bulk scrape teknisi stock:
 * - 1 Instance BrowserContext per 1 Gudang.
 * - Multi-gudang paralel.
 * - 1 gudang memproses NIK teknisi dengan micro-pool (2 tab paralel).
 */
export async function bulkScrapeStockTeknisi(
    options: BulkScrapingOptions = {}
): Promise<BulkScrapingResult> {
    const niksPerWarehouse =
        options.niksPerWarehouse ??
        (options.batchSize ? Math.max(1, Math.floor(options.batchSize / 5)) : 10);
    const concurrencyPerWarehouse = options.concurrencyPerWarehouse ?? 2;

    actionLogger.info('[BulkScrape] Memulai bulk stock scraping multi-gudang', {
        niksPerWarehouse,
        concurrencyPerWarehouse,
    });

    // 1. Ambil seluruh gudang dari master warehouse
    const warehouses = await db
        .selectFrom('inventory.mas_wh')
        .select(['id', 'name', 'pic_1', 'pic_2'])
        .orderBy('id', 'asc')
        .execute();

    if (warehouses.length === 0) {
        actionLogger.warn('[BulkScrape] Tidak ada gudang ditemukan di database.');
        return { total: 0, success: 0, failed: 0, details: [] };
    }

    // 2. Siapkan worker task untuk setiap gudang yang memiliki akun Lensa aktif
    const workerParams: WarehouseWorkerParam[] = [];

    for (const wh of warehouses) {
        const creds = await getWarehouseLensaCredentials(wh.pic_1, wh.pic_2);
        if (!creds) {
            actionLogger.warn(
                `[BulkScrape] Gudang "${wh.name}" (id=${wh.id}) dilewati: PIC tidak memiliki akun Lensa terhubung.`
            );
            continue;
        }

        // Ambil NIK teknisi terlama / belum pernah discrape di gudang ini
        const technicians = await db
            .selectFrom('hr.technicians as t')
            .select(['t.nik', 't.name'])
            .where('t.wh_id', '=', wh.id)
            .orderBy(sql`t.ref_intech_lensa->>'scraped_at' ASC NULLS FIRST`)
            .orderBy('t.nik', 'asc')
            .limit(niksPerWarehouse)
            .execute();

        if (technicians.length === 0) {
            actionLogger.info(
                `[BulkScrape] Gudang "${wh.name}" (id=${wh.id}) tidak memiliki teknisi yang perlu discrape.`
            );
            continue;
        }

        workerParams.push({
            warehouseId: wh.id,
            warehouseName: wh.name,
            username: creds.username,
            password: creds.password,
            technicians,
            concurrency: concurrencyPerWarehouse,
        });
    }

    if (workerParams.length === 0) {
        actionLogger.info(
            '[BulkScrape] Tidak ada teknisi atau akun gudang yang memenuhi syarat scraping.'
        );
        return { total: 0, success: 0, failed: 0, details: [] };
    }

    actionLogger.info(
        `[BulkScrape] Meluncurkan ${workerParams.length} instance gudang paralel (total target: ${workerParams.reduce((acc, w) => acc + w.technicians.length, 0)} teknisi)...`
    );

    // 3. Jalankan seluruh gudang secara PARALEL (1 instance context per gudang)
    const warehouseExecutionResults = await Promise.all(
        workerParams.map((param) => scrapeWarehouseWorker(param))
    );

    // 4. Kumpulkan hasil keseluruhan dan ringkasan per gudang
    const allDetails = warehouseExecutionResults.flat();
    const byWarehouse: WarehouseScrapeSummary[] = workerParams.map((param, index) => {
        const whResults = warehouseExecutionResults[index];
        return {
            warehouseId: param.warehouseId,
            warehouseName: param.warehouseName,
            total: whResults.length,
            success: whResults.filter((r) => r.status === 'success').length,
            failed: whResults.filter((r) => r.status === 'failed').length,
        };
    });

    const summary: BulkScrapingResult = {
        total: allDetails.length,
        success: allDetails.filter((r) => r.status === 'success').length,
        failed: allDetails.filter((r) => r.status === 'failed').length,
        details: allDetails,
        byWarehouse,
    };

    actionLogger.info('[BulkScrape] Multi-warehouse bulk scraping selesai:', {
        total: summary.total,
        success: summary.success,
        failed: summary.failed,
        warehouses: byWarehouse.map((w) => `${w.warehouseName}: ${w.success}/${w.total} sukses`),
    });

    return summary;
}
