/**
 * Inventory Repository - Stored procedure wrappers
 * Priority: Use stored procedures for atomicity and data integrity
 * All critical operations go through stored procedures in inventory schema
 *
 * The implementation is split by domain into focused modules under
 * `./inventory/*`. The composed object below keeps the public
 * `inventoryRepository.<method>()` API stable for all consumers.
 */

import type { Kysely, Transaction } from 'kysely';
import type { DB } from '@/lib/db/database.types';
import { db } from '@/lib/db/db';
import { createHasilRekonRepository } from './inventory/hasil-rekon';
import { createMasterDataRepository } from './inventory/master-data';
import { createOutSapRepository } from './inventory/out-sap';
import { createStoredProcedureRepository } from './inventory/stored-procedures';

export type {
    HasilRekonItem,
    HasilRekonPaginatedFilter,
    InOutTagFilters,
} from './inventory/types';

/**
 * Repository provides high-level data access methods
 * Critical operations use stored procedures for atomicity
 * Read operations use Kysely query builder for type safety
 */
export const createInventoryRepository = (dbClient: Kysely<DB> | Transaction<DB>) => ({
    // ==================== Stored Procedure Wrappers (Priority) ====================
    ...createStoredProcedureRepository(dbClient),

    // ==================== Master Data & Stock ====================
    ...createMasterDataRepository(dbClient),

    // ==================== Out SAP Queries ====================
    ...createOutSapRepository(dbClient),

    // ==================== Hasil Rekon Queries ====================
    ...createHasilRekonRepository(dbClient),
});

/**
 * Type-safe factory function
 */
export type InventoryRepository = ReturnType<typeof createInventoryRepository>;

/**
 * Singleton repository instance bound to default database connection
 */
export const inventoryRepository = createInventoryRepository(db);
