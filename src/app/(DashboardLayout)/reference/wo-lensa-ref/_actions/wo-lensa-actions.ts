/**
 * Barrel re-export - wo-lensa-actions.ts
 *
 * Split for maintainability (M2 audit fix):
 *   - wo-lensa-queries.ts  - read-only DB queries
 *   - wo-lensa-scraper.ts  - scraping background logic
 *
 * Import path ../_actions/wo-lensa-actions remains unchanged for consumers.
 */

export type {
    GetWOLensaListOptions,
    PaginatedWOLensaResult,
    WOLensaDetail,
    WOLensaHeader,
} from './wo-lensa-queries';
export {
    getWOLensaFilterOptions,
    getWOLensaList,
    getWOLensaRefDetails,
    getWOLensaRefList,
} from './wo-lensa-queries';

export {
    checkWOScrapingStatus,
    internalTriggerWOScraping,
    triggerWOScraping,
} from './wo-lensa-scraper';
