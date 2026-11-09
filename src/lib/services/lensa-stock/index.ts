/**
 * Public barrel export for Lensa Stock scraping domain services.
 *
 * Modular architecture:
 * - bulk-service.ts: Multi-warehouse parallel bulk stock scraping
 */

export {
    type BulkScrapingOptions,
    bulkScrapeStockTeknisi,
    type ScrapingResult,
    type WarehouseScrapeSummary,
} from './bulk-service';

