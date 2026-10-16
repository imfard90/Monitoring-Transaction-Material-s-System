import { describe, expect, it } from 'vitest';
import { formatStockAge } from '@/lib/stock-intech-age';

describe('formatStockAge', () => {
    it('formats completed calendar months and remaining days', () => {
        expect(
            formatStockAge('2025-01-15T12:00:00.000Z', new Date('2025-04-20T12:00:00.000Z'))
        ).toBe('3 bulan 5 hari');
    });

    it('formats ages shorter than a month', () => {
        expect(
            formatStockAge('2025-04-17T00:00:00.000Z', new Date('2025-04-20T00:00:00.000Z'))
        ).toBe('0 bulan 3 hari');
    });

    it('returns a dash for invalid dates and does not produce negative ages', () => {
        expect(formatStockAge('invalid', new Date('2025-04-20T00:00:00.000Z'))).toBe('-');
        expect(
            formatStockAge('2025-04-21T00:00:00.000Z', new Date('2025-04-20T00:00:00.000Z'))
        ).toBe('-');
    });
});
