/**
 * Barrel re-export - out-lensa-actions.ts
 *
 * Split for maintainability (M2 audit fix):
 *   - out-lensa-queries.ts  - read-only DB queries
 *   - out-lensa-commands.ts - write operations with use server
 *
 * Import path ../_actions/out-lensa-actions remains unchanged for consumers.
 */

export type {
    ScrapedOutLensaDetailMaterial,
    ScrapedOutLensaDetailResult,
} from './out-lensa-commands';
export {
    internalTriggerScraping,
    scrapeReservationAction,
    scrapeSingleOutLensaDetail,
    triggerScraping,
} from './out-lensa-commands';
export type {
    GetOutLensaRefListOptions,
    OutLensaDetail,
    OutLensaHeader,
    OutLensaReservationOption,
    PaginatedOutLensaResult,
    ScraperLastUpdateInfo,
} from './out-lensa-queries';
export {
    checkScrapingStatus,
    getOutLensaFilterOptions,
    getOutLensaRefDetails,
    getOutLensaRefList,
    getOutLensaReservationIdOptions,
} from './out-lensa-queries';
