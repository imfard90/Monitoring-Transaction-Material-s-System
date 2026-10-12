/**
 * Warehouse helper utilities for normalization, alias expansion, and fuzzy matching.
 * Specifically resolves naming variations between external Lensa systems ("SO Karang Pilang")
 * and MTMS internal master data ("SO Karangpilang").
 */

export const CANONICAL_KARANGPILANG = 'SO Karangpilang';
export const ALIAS_KARANG_PILANG = 'SO Karang Pilang';

/**
 * Normalizes a warehouse string for comparison:
 * lowercases and strips all whitespace.
 */
export function normalizeWarehouseKey(name: string | null | undefined): string {
    if (!name) return '';
    return name.trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Returns the canonical system warehouse name for a given warehouse name or alias.
 * Maps known scraper variations (e.g. "SO Karang Pilang") to the master name ("SO Karangpilang").
 */
export function toCanonicalWarehouseName(name: string | null | undefined): string {
    if (!name) return '';
    const key = normalizeWarehouseKey(name);
    if (key === normalizeWarehouseKey(CANONICAL_KARANGPILANG)) {
        return CANONICAL_KARANGPILANG;
    }
    return name.trim();
}

/**
 * Checks whether two warehouse names refer to the same warehouse.
 * Handles space variations (e.g. "SO Karang Pilang" vs "SO Karangpilang") and case insensitivity.
 */
export function isSameWarehouse(
    nameA: string | null | undefined,
    nameB: string | null | undefined
): boolean {
    if (!nameA || !nameB) return false;
    return normalizeWarehouseKey(nameA) === normalizeWarehouseKey(nameB);
}

/**
 * Expands a warehouse name or list of warehouse names to include all known alias variations.
 * E.g. 'SO Karangpilang' -> ['SO Karangpilang', 'SO Karang Pilang']
 * E.g. 'SO Karang Pilang' -> ['SO Karang Pilang', 'SO Karangpilang']
 * E.g. ['SO Gresik', 'SO Karangpilang'] -> ['SO Gresik', 'SO Karangpilang', 'SO Karang Pilang']
 * Useful for SQL WHERE ... IN clauses so queries match regardless of scraper spacing.
 */
export function expandWarehouseAliases(
    warehouseNames: string | string[] | null | undefined
): string[] {
    if (!warehouseNames) return [];
    const inputs = Array.isArray(warehouseNames) ? warehouseNames : [warehouseNames];
    const result = new Set<string>();

    for (const name of inputs) {
        if (!name || name === 'all') continue;
        const trimmed = name.trim();
        result.add(trimmed);

        const key = normalizeWarehouseKey(trimmed);
        if (key === normalizeWarehouseKey(CANONICAL_KARANGPILANG)) {
            result.add(CANONICAL_KARANGPILANG);
            result.add(ALIAS_KARANG_PILANG);
        }
    }

    return Array.from(result);
}

/**
 * Matches a warehouse name against a list of master warehouses (inventory.mas_wh items).
 */
export function findMatchingMasterWarehouse<T extends { name: string | null }>(
    warehouseName: string | null | undefined,
    masterWarehouses: T[]
): T | undefined {
    if (!warehouseName) return undefined;
    const targetKey = normalizeWarehouseKey(warehouseName);
    return masterWarehouses.find((wh) => normalizeWarehouseKey(wh.name) === targetKey);
}
