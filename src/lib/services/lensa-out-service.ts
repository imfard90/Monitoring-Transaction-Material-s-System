/**
 * Public entry point for the Out Lensa scraping services.
 *
 * The implementation is split across focused modules so each flow (sync,
 * single detail) stays independently readable and testable.
 * This barrel keeps the existing import path stable for consumers.
 */

export { executeOutLensaScraping } from './lensa-out/sync-service';
export { scrapeSingleOutLensaDetailService } from './lensa-out/detail-service';

export type {
    OutLensaAccountResult,
    OutLensaScrapeOutcome,
    ScrapedOutLensaDetailMaterial,
    ScrapedOutLensaDetailResult,
} from './lensa-out/types';
