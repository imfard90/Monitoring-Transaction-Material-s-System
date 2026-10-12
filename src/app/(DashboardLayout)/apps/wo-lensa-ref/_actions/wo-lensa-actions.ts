/**
 * Barrel re-export - wo-lensa-actions.ts
 *
 * Split for maintainability (M2 audit fix):
 *   - wo-lensa-queries.ts  - read-only DB queries
 *   - wo-lensa-scraper.ts  - scraping background logic
 *
 * Import path ../_actions/wo-lensa-actions remains unchanged for consumers.
 */

export {
    getWOLensaList,
    getWOLensaFilterOptions,
    getWOLensaRefList,
    getWOLensaRefDetails,
} from './wo-lensa-queries';

export type {
    WOLensaHeader,
    WOLensaDetail,
    PaginatedWOLensaResult,
    GetWOLensaListOptions,
} from './wo-lensa-queries';

export {
    internalTriggerWOScraping,
    triggerWOScraping,
    checkWOScrapingStatus,
} from './wo-lensa-scraper';
