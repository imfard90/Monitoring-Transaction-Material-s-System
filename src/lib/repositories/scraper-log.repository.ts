import type { ColumnType, Generated, Kysely } from 'kysely';
import { db } from '@/lib/db/db';

export type ScraperType = 'out_lensa' | 'wo_lensa' | 'stock_teknisi' | 'other_stock';
export type ScraperAction = 'system' | 'manual';

export interface InventoryScraperCronjobLogRow {
    id: Generated<string | number>;
    scraper_type: ScraperType;
    action: ScraperAction;
    resume_result: string;
    timestamp: ColumnType<Date, string | Date | undefined, string | Date | undefined>;
}

export type ScraperLogDatabase = {
    'inventory.scraper_cronjob_log': InventoryScraperCronjobLogRow;
};

export interface ScraperLogInsert {
    scraper_type: ScraperType;
    action: ScraperAction;
    resume_result: string;
    timestamp?: Date;
}

export interface ScraperLog {
    id: number | string;
    scraper_type: ScraperType;
    action: ScraperAction;
    resume_result: string;
    timestamp: Date;
}

export function createScraperLogRepository(db: Kysely<any>) {
    const typedDb = db as unknown as Kysely<ScraperLogDatabase>;

    return {
        /**
         * Simpan riwayat eksekusi cronjob atau manual scraping.
         */
        async insertLog(data: ScraperLogInsert): Promise<ScraperLog> {
            const row = await typedDb
                .insertInto('inventory.scraper_cronjob_log')
                .values({
                    scraper_type: data.scraper_type,
                    action: data.action,
                    resume_result: data.resume_result,
                    ...(data.timestamp ? { timestamp: data.timestamp } : {}),
                } as any)
                .returningAll()
                .executeTakeFirstOrThrow();

            return {
                id: row.id,
                scraper_type: row.scraper_type,
                action: row.action,
                resume_result: row.resume_result,
                timestamp: new Date(row.timestamp),
            };
        },

        /**
         * Ambil log eksekusi terbaru berdasarkan tipe scraper.
         */
        async getLatestLog(scraperType: ScraperType): Promise<ScraperLog | null> {
            const row = await typedDb
                .selectFrom('inventory.scraper_cronjob_log')
                .selectAll()
                .where('scraper_type', '=', scraperType)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .executeTakeFirst();

            if (!row) return null;

            return {
                id: row.id,
                scraper_type: row.scraper_type,
                action: row.action,
                resume_result: row.resume_result,
                timestamp: new Date(row.timestamp),
            };
        },
    };
}

export const scraperLogRepository = createScraperLogRepository(db);

