/**
 * Public barrel export for WO Lensa scraping domain services.
 *
 * Modular architecture:
 * - detail-service.ts: Single WO detail scraper with fallback search
 * - nightly-service.ts: Nightly deep sweep WO Lensa by technician NIK
 * - sync-service.ts: Standard bulk/scheduled WO Lensa synchronization
 * - types.ts: Shared interfaces and date utilities
 */

export { scrapeSingleWODetailService } from './detail-service';
export { executeNightlyWOLensaScrapingByNik } from './nightly-service';
export {
    executeWOLensaScraping,
    syncMissingWOLensaDetails,
} from './sync-service';
export {
    type LensaDetailMaterial,
    type ScrapedWODetailMaterial,
    type ScrapedWODetailResult,
    toISODateString,
    type WOLensaScrapeOutcome,
} from './types';
