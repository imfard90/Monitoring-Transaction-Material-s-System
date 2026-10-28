/**
 * Barrel re-export - out-lensa-actions.ts
 *
 * Split for maintainability (M2 audit fix):
 *   - out-lensa-queries.ts  - read-only DB queries
 *   - out-lensa-commands.ts - write operations with use server
 *
 * Import path ../_actions/out-lensa-actions remains unchanged for consumers.
 */

export {
    internalTriggerScraping,
    scrapeReservationAction,
    triggerScraping,
} from './out-lensa-commands';
export type {
    GetOutLensaRefListOptions,
    OutLensaDetail,
    OutLensaHeader,
    PaginatedOutLensaResult,
    ScraperLastUpdateInfo,
} from './out-lensa-queries';
export {
    checkScrapingStatus,
    getOutLensaFilterOptions,
    getOutLensaRefDetails,
    getOutLensaRefList,
} from './out-lensa-queries';
