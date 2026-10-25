/**
 * Bulk Stock Scraper Service
 * Purpose: Scrape Lensa stock for batch of technicians and cache results
 */

import { sql } from 'kysely';
import { decryptLensaPassword } from '@/lib/crypto/decrypt-lensa';
import { db } from '@/lib/db/db';
import { scrapeStockTeknisi } from '@/lib/lensa-scraper/lensa-scraper';
import { actionLogger } from '@/lib/logger';

interface ScrapingResult {
    nik: string;
    status: 'success' | 'failed';
    error?: string;
}

/**
 * Scrape stock untuk satu teknisi dengan retry 3x.
 * Update hr.technicians.ref_intech_lensa dengan hasil.
 */
async function scrapeTeknisiWithRetry(
    nik: string,
    lensaUsername: string,
    lensaPassword: string,
    maxRetries = 3
): Promise<ScrapingResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await scrapeStockTeknisi(nik, lensaUsername, lensaPassword);

            // Success — update DB
            await db
                .updateTable('hr.technicians')
                .set({
                    ref_intech_lensa: sql`${JSON.stringify({
                        status: 'success',
                        scraped_at: new Date().toISOString(),
                        error_message: null,
                        materials: result.materials,
                    })}::jsonb`,
                })
                .where('nik', '=', nik)
                .execute();

            actionLogger.info(`Scraping success for NIK ${nik} on attempt ${attempt}`);
            return { nik, status: 'success' };
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            actionLogger.warn(`Scraping failed for NIK ${nik} attempt ${attempt}/${maxRetries}:`, {
                error: lastError.message,
            });

            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s delay
            }
        }
    }

    // Failed after retries — update DB
    const errorMessage = lastError?.message || 'Unknown error';
    await db
        .updateTable('hr.technicians')
        .set({
            ref_intech_lensa: sql`${JSON.stringify({
                status: 'failed',
                scraped_at: new Date().toISOString(),
                error_message: errorMessage,
                materials: [],
            })}::jsonb`,
        })
        .where('nik', '=', nik)
        .execute();

    actionLogger.error(
        `Scraping failed for NIK ${nik} after ${maxRetries} retries`,
        lastError ?? new Error(errorMessage)
    );
    return { nik, status: 'failed', error: errorMessage };
}

export interface BulkScrapingOptions {
    batchSize?: number;
    offset?: number;
}

export interface BulkScrapingResult {
    total: number;
    success: number;
    failed: number;
    details: ScrapingResult[];
}

/**
 * Bulk scrape teknisi stock — batch of 50 teknisi.
 * Returns summary of results.
 */
export async function bulkScrapeStockTeknisi(
    options: BulkScrapingOptions = {}
): Promise<BulkScrapingResult> {
    const { batchSize = 50, offset = 0 } = options;

    actionLogger.info('Starting bulk stock scraping', { batchSize, offset });

    // 1. Ambil batch teknisi yang sudah di-assign gudang
    const teknisiList = await db
        .selectFrom('hr.technicians as t')
        .innerJoin('inventory.mas_wh as wh', 't.wh_id', 'wh.id')
        .select(['t.nik', 't.name', 't.wh_id', 'wh.pic_1', 'wh.pic_2'])
        .where('t.wh_id', 'is not', null)
        .orderBy(sql`t.ref_intech_lensa->>'scraped_at' ASC NULLS FIRST`)
        .orderBy('t.nik', 'asc')
        .limit(batchSize)
        .offset(offset)
        .execute();

    if (teknisiList.length === 0) {
        actionLogger.info('No teknisi to scrape in this batch');
        return { total: 0, success: 0, failed: 0, details: [] };
    }

    const results: ScrapingResult[] = [];

    // 2. Scrape setiap teknisi
    for (const teknisi of teknisiList) {
        try {
            // Ambil kredensial Lensa dari PIC gudang (PIC 1 → fallback PIC 2)
            let lensaUsername: string | undefined;
            let lensaPassword: string | undefined;

            for (const picNik of [teknisi.pic_1, teknisi.pic_2]) {
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
                    lensaUsername = picUser.lensa_username;
                    lensaPassword = decryptLensaPassword(picUser.lensa_password);
                    break;
                }
            }

            if (!lensaUsername || !lensaPassword) {
                actionLogger.warn(
                    `No Lensa credentials for teknisi ${teknisi.nik} (gudang ${teknisi.wh_id})`
                );
                results.push({
                    nik: teknisi.nik,
                    status: 'failed',
                    error: 'Gudang tidak memiliki akun Lensa terhubung',
                });

                // Update DB dengan status failed
                await db
                    .updateTable('hr.technicians')
                    .set({
                        ref_intech_lensa: sql`${JSON.stringify({
                            status: 'failed',
                            scraped_at: new Date().toISOString(),
                            error_message: 'Gudang tidak memiliki akun Lensa terhubung',
                            materials: [],
                        })}::jsonb`,
                    })
                    .where('nik', '=', teknisi.nik)
                    .execute();

                continue;
            }

            // Scrape dengan retry
            const result = await scrapeTeknisiWithRetry(teknisi.nik, lensaUsername, lensaPassword);
            results.push(result);

            // Delay 2s antar scrape untuk avoid throttle
            await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
            actionLogger.error(
                `Unexpected error scraping teknisi ${teknisi.nik}`,
                error instanceof Error ? error : new Error(String(error))
            );
            results.push({
                nik: teknisi.nik,
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const summary = {
        total: results.length,
        success: results.filter((r) => r.status === 'success').length,
        failed: results.filter((r) => r.status === 'failed').length,
        details: results,
    };

    actionLogger.info('Bulk scraping completed', summary);
    return summary;
}
