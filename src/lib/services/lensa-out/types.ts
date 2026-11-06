/**
 * Shared types and contracts for the Out Lensa scraping services.
 */

import type { OutLensaHeader } from '@/lib/lensa-scraper/lensa-out-scraper';

export interface ScrapedOutLensaDetailMaterial {
    material_id: string | null;
    material_desc: string | null;
    qty_approve: string | null;
}

export interface ScrapedOutLensaDetailResult {
    reservation_id: string;
    gi_number: string | null;
    nama_gudang: string | null;
    mitra: string | null;
    materials: ScrapedOutLensaDetailMaterial[];
}

/** Per-account outcome recorded for each scraping phase. */
export interface OutLensaAccountResult {
    username: string;
    phase: 'headers' | 'details';
    gudang?: string;
    status: 'success' | 'login_fail' | 'scrape_fail' | 'no_data' | 'skip';
    count: number;
    error?: string;
}

export interface OutLensaScrapeOutcome {
    success: boolean;
    newCount?: number;
    usersScraped?: number;
    accountResults?: OutLensaAccountResult[];
    error?: string;
}

/**
 * Out Lensa header enriched with the Lensa account that scraped it.
 *
 * `scraped_by_username` is not part of the scraped payload — it is attached
 * by the service so the persisted row records its provenance.
 */
export type OutLensaHeaderWithProvenance = OutLensaHeader & {
    scraped_by_username: string;
};

/** Material row as returned by the Lensa detail endpoint (column-name keyed). */
export type LensaDetailMaterial = Record<string, unknown>;

/** Detail payload returned by `scrapeLensaDetails`. */
export interface OutLensaDetail {
    header_id: string;
    reservation_id?: string;
    gi_number?: string | null;
    nama_gudang?: string | null;
    mitra?: string | null;
    materials?: LensaDetailMaterial[];
}
