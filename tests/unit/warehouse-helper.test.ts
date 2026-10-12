import { describe, expect, it } from 'vitest';
import {
    ALIAS_KARANG_PILANG,
    CANONICAL_KARANGPILANG,
    expandWarehouseAliases,
    findMatchingMasterWarehouse,
    isSameWarehouse,
    normalizeWarehouseKey,
    toCanonicalWarehouseName,
} from '@/lib/warehouse-helper';

describe('warehouse-helper', () => {
    describe('normalizeWarehouseKey', () => {
        it('normalizes strings by trimming, lowercasing, and stripping internal whitespace', () => {
            expect(normalizeWarehouseKey('SO Karang Pilang')).toBe('sokarangpilang');
            expect(normalizeWarehouseKey('SO Karangpilang')).toBe('sokarangpilang');
            expect(normalizeWarehouseKey('  SO   Karang   Pilang  ')).toBe('sokarangpilang');
            expect(normalizeWarehouseKey('so karang pilang')).toBe('sokarangpilang');
            expect(normalizeWarehouseKey('SO Gresik')).toBe('sogresik');
        });

        it('returns empty string for null, undefined, or empty strings', () => {
            expect(normalizeWarehouseKey(null)).toBe('');
            expect(normalizeWarehouseKey(undefined)).toBe('');
            expect(normalizeWarehouseKey('')).toBe('');
            expect(normalizeWarehouseKey('   ')).toBe('');
        });
    });

    describe('toCanonicalWarehouseName', () => {
        it('maps "SO Karang Pilang" variations to canonical "SO Karangpilang"', () => {
            expect(toCanonicalWarehouseName('SO Karang Pilang')).toBe(CANONICAL_KARANGPILANG);
            expect(toCanonicalWarehouseName('SO Karangpilang')).toBe(CANONICAL_KARANGPILANG);
            expect(toCanonicalWarehouseName('so karang pilang')).toBe(CANONICAL_KARANGPILANG);
            expect(toCanonicalWarehouseName('SO   Karang   Pilang')).toBe(CANONICAL_KARANGPILANG);
        });

        it('preserves other warehouse names trimmed', () => {
            expect(toCanonicalWarehouseName('SO Gresik')).toBe('SO Gresik');
            expect(toCanonicalWarehouseName('  SO Lamongan  ')).toBe('SO Lamongan');
            expect(toCanonicalWarehouseName('SO Tuban')).toBe('SO Tuban');
        });

        it('handles null, undefined, and empty string safely', () => {
            expect(toCanonicalWarehouseName(null)).toBe('');
            expect(toCanonicalWarehouseName(undefined)).toBe('');
            expect(toCanonicalWarehouseName('')).toBe('');
        });
    });

    describe('isSameWarehouse', () => {
        it('identifies "SO Karang Pilang" and "SO Karangpilang" as the same warehouse', () => {
            expect(isSameWarehouse('SO Karang Pilang', 'SO Karangpilang')).toBe(true);
            expect(isSameWarehouse('SO Karangpilang', 'SO Karang Pilang')).toBe(true);
            expect(isSameWarehouse('so karang pilang', 'SO Karangpilang')).toBe(true);
            expect(isSameWarehouse('SO  Karang  Pilang', 'so karangpilang')).toBe(true);
        });

        it('returns true for matching standard warehouse names regardless of casing or extra spaces', () => {
            expect(isSameWarehouse('SO Gresik', 'so gresik')).toBe(true);
            expect(isSameWarehouse('  SO Tuban  ', 'SO Tuban')).toBe(true);
        });

        it('returns false for different warehouses', () => {
            expect(isSameWarehouse('SO Karangpilang', 'SO Gresik')).toBe(false);
            expect(isSameWarehouse('SO Karang Pilang', 'SO Lamongan')).toBe(false);
            expect(isSameWarehouse('SO Bojonegoro', 'SO Tuban')).toBe(false);
        });

        it('returns false when either argument is null, undefined, or empty', () => {
            expect(isSameWarehouse(null, 'SO Karangpilang')).toBe(false);
            expect(isSameWarehouse('SO Karangpilang', undefined)).toBe(false);
            expect(isSameWarehouse(null, null)).toBe(false);
            expect(isSameWarehouse('', '')).toBe(false);
        });
    });

    describe('expandWarehouseAliases', () => {
        it('expands single string "SO Karangpilang" to include both alias variants', () => {
            const result = expandWarehouseAliases('SO Karangpilang');
            expect(result).toContain(CANONICAL_KARANGPILANG);
            expect(result).toContain(ALIAS_KARANG_PILANG);
            expect(result.length).toBe(2);
        });

        it('expands single string "SO Karang Pilang" to include both alias variants', () => {
            const result = expandWarehouseAliases('SO Karang Pilang');
            expect(result).toContain(CANONICAL_KARANGPILANG);
            expect(result).toContain(ALIAS_KARANG_PILANG);
            expect(result.length).toBe(2);
        });

        it('expands an array of warehouse names preserving non-aliased warehouses and expanding Karangpilang', () => {
            const input = ['SO Gresik', 'SO Karangpilang', 'SO Tuban'];
            const result = expandWarehouseAliases(input);

            expect(result).toContain('SO Gresik');
            expect(result).toContain('SO Tuban');
            expect(result).toContain(CANONICAL_KARANGPILANG);
            expect(result).toContain(ALIAS_KARANG_PILANG);
            expect(result.length).toBe(4);
        });

        it('leaves non-aliased warehouse names unchanged without duplicates', () => {
            const result = expandWarehouseAliases('SO Gresik');
            expect(result).toEqual(['SO Gresik']);
        });

        it('filters out "all", empty strings, null, and undefined', () => {
            expect(expandWarehouseAliases('all')).toEqual([]);
            expect(expandWarehouseAliases(['all', ''])).toEqual([]);
            expect(expandWarehouseAliases(null)).toEqual([]);
            expect(expandWarehouseAliases(undefined)).toEqual([]);
            expect(expandWarehouseAliases([])).toEqual([]);
        });
    });

    describe('findMatchingMasterWarehouse', () => {
        const masterWarehouses = [
            { id: 1, name: 'SO Karangpilang', branch: 'Lamongan' },
            { id: 2, name: 'SO Gresik', branch: 'Lamongan' },
            { id: 3, name: 'SO Lamongan', branch: 'Lamongan' },
        ];

        it('matches scraper warehouse "SO Karang Pilang" to master item "SO Karangpilang"', () => {
            const match = findMatchingMasterWarehouse('SO Karang Pilang', masterWarehouses);
            expect(match).toBeDefined();
            expect(match?.id).toBe(1);
            expect(match?.name).toBe('SO Karangpilang');
        });

        it('matches master warehouse name "SO Karangpilang" directly', () => {
            const match = findMatchingMasterWarehouse('SO Karangpilang', masterWarehouses);
            expect(match).toBeDefined();
            expect(match?.id).toBe(1);
        });

        it('matches other warehouses case-insensitively with space tolerance', () => {
            const match = findMatchingMasterWarehouse('so gresik', masterWarehouses);
            expect(match).toBeDefined();
            expect(match?.id).toBe(2);
        });

        it('returns undefined if warehouse is not found', () => {
            const match = findMatchingMasterWarehouse('SO Unknown', masterWarehouses);
            expect(match).toBeUndefined();
        });

        it('returns undefined for null or undefined input', () => {
            expect(findMatchingMasterWarehouse(null, masterWarehouses)).toBeUndefined();
            expect(findMatchingMasterWarehouse(undefined, masterWarehouses)).toBeUndefined();
        });
    });
});
