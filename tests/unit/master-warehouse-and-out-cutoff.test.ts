import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));
import {
    allBeforeCutoffOut,
    isBeforeCutoffOut,
    isWithinCutoffOut,
} from '@/lib/lensa-scraper/lensa-out-scraper';
import { isMasterWarehouse, KNOWN_MASTER_WAREHOUSE_NAMES } from '@/lib/warehouse-helper';

describe('Master Warehouse Validation', () => {
    it('approves all official master warehouses and aliases', () => {
        expect(isMasterWarehouse('SO Karangpilang')).toBe(true);
        expect(isMasterWarehouse('SO Karang Pilang')).toBe(true);
        expect(isMasterWarehouse('SO Gresik')).toBe(true);
        expect(isMasterWarehouse('SO Lamongan')).toBe(true);
        expect(isMasterWarehouse('SO Bojonegoro')).toBe(true);
        expect(isMasterWarehouse('SO Tuban')).toBe(true);
        expect(isMasterWarehouse('Sby Kebalen')).toBe(true);
        expect(isMasterWarehouse('Vendors')).toBe(true);

        // Case insensitive and whitespace tolerant
        expect(isMasterWarehouse('so gresik')).toBe(true);
        expect(isMasterWarehouse('  SO TUBAN  ')).toBe(true);
    });

    it('rejects unmanaged and unauthorized external warehouses like Lakarsantri', () => {
        expect(isMasterWarehouse('SO Lakarsantri')).toBe(false);
        expect(isMasterWarehouse('Lakarsantri')).toBe(false);
        expect(isMasterWarehouse('Gudang Antah Berantah')).toBe(false);
        expect(isMasterWarehouse(null)).toBe(false);
        expect(isMasterWarehouse(undefined)).toBe(false);
        expect(isMasterWarehouse('')).toBe(false);
    });

    it('contains all 8 known master names in KNOWN_MASTER_WAREHOUSE_NAMES', () => {
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('SO Karangpilang');
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('SO Karang Pilang');
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('SO Gresik');
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('SO Lamongan');
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('SO Bojonegoro');
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('SO Tuban');
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('Sby Kebalen');
        expect(KNOWN_MASTER_WAREHOUSE_NAMES).toContain('Vendors');
    });
});

describe('Out Lensa Cutoff Date Validation (October 2026 Floor)', () => {
    it('allows dates within October 2026 and after', () => {
        expect(isWithinCutoffOut('2026-10-01')).toBe(true);
        expect(isWithinCutoffOut('2026-10-15 14:30:00')).toBe(true);
        expect(isWithinCutoffOut('2026-11-09')).toBe(true);
        expect(isWithinCutoffOut('01/10/2026')).toBe(true); // dd/MM/yyyy fallback
    });

    it('filters out dates before October 2026', () => {
        expect(isWithinCutoffOut('2026-09-30 23:59:59')).toBe(false);
        expect(isWithinCutoffOut('2026-09-01')).toBe(false);
        expect(isWithinCutoffOut('2026-08-15')).toBe(false);
        expect(isWithinCutoffOut(null)).toBe(false);
    });

    it('correctly reports isBeforeCutoffOut', () => {
        expect(isBeforeCutoffOut('2026-09-30')).toBe(true);
        expect(isBeforeCutoffOut('2026-10-01')).toBe(false);
        expect(isBeforeCutoffOut(null)).toBe(true);
    });

    it('correctly evaluates allBeforeCutoffOut across batches', () => {
        const oldBatch = [
            { tgl_entry: '2026-09-28' },
            { tgl_entry: '2026-09-29' },
        ];
        expect(allBeforeCutoffOut(oldBatch)).toBe(true);

        const mixedBatch = [
            { tgl_entry: '2026-09-28' },
            { tgl_entry: '2026-10-02' },
        ];
        expect(allBeforeCutoffOut(mixedBatch)).toBe(false);

        expect(allBeforeCutoffOut([])).toBe(true);
    });
});
