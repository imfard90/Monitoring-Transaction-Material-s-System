/**
 * Public barrel export for OUT Lensa scraping domain services.
 *
 * Modular architecture:
 * - detail-service.ts: Single OUT Lensa detail scraper with fallback search
 * - sync-service.ts: Standard bulk/scheduled OUT Lensa reservation synchronization
 * - types.ts: Shared interfaces and types
 */

export { scrapeSingleOutLensaDetailService } from './detail-service';
export { executeOutLensaScraping } from './sync-service';
export type {
    OutLensaAccountResult,
    OutLensaScrapeOutcome,
    ScrapedOutLensaDetailMaterial,
    ScrapedOutLensaDetailResult,
} from './types';

