import { describe, expect, it, vi } from 'vitest';

vi.mock('googleapis', () => ({ google: { auth: {}, sheets: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ actionLogger: { info: vi.fn(), error: vi.fn() } }));

import { normalizeStockQuantity } from '@/lib/google_ecosystem/sheets-stock-sync';

describe('normalizeStockQuantity', () => {
    it.each([
        ['1.234', 1234],
        ['1,234', 1234],
        ['1.234,56', 1234.56],
        ['1,234.56', 1234.56],
        ['1234,5', 1234.5],
        [' 2 345 ', 2345],
        [1234, 1234],
    ])('normalizes %s to %s', (input, expected) => {
        expect(normalizeStockQuantity(input)).toBe(expected);
    });

    it.each(['', 'N/A', '--', '1,2,3', 'Infinity'])('rejects invalid value %s', (input) => {
        expect(normalizeStockQuantity(input)).toBeNull();
    });

    it('rejects non-string and non-number values', () => {
        expect(normalizeStockQuantity(null)).toBeNull();
        expect(normalizeStockQuantity(Number.NaN)).toBeNull();
        expect(normalizeStockQuantity({})).toBeNull();
    });
});
