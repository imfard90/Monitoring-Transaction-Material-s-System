import { describe, expect, it } from 'vitest';
import { formatDateId, formatRupiah } from '@/lib/formatters';

describe('formatters', () => {
    describe('formatRupiah', () => {
        it('formats valid numbers to Rupiah string', () => {
            const result = formatRupiah(1500000);
            // Replace non-breaking spaces if any
            expect(result.replace(/\s+/g, ' ')).toMatch(/Rp\s?1\.500\.000/);
        });

        it('handles null, undefined, and NaN gracefully', () => {
            expect(formatRupiah(null).replace(/\s+/g, ' ')).toMatch(/Rp\s?0/);
            expect(formatRupiah(undefined).replace(/\s+/g, ' ')).toMatch(/Rp\s?0/);
            expect(formatRupiah(Number.NaN).replace(/\s+/g, ' ')).toMatch(/Rp\s?0/);
        });
    });

    describe('formatDateId', () => {
        it('formats date to Indonesian locale with time', () => {
            const date = new Date('2026-05-15T10:30:00Z');
            const result = formatDateId(date, true);
            expect(result).toMatch(/15/);
            expect(result).toMatch(/2026/);
        });

        it('formats date without time when includeTime is false', () => {
            const date = new Date('2026-05-15T10:30:00Z');
            const result = formatDateId(date, false);
            expect(result).toMatch(/15/);
            expect(result).not.toMatch(/:/);
        });

        it('returns dash on invalid or null date', () => {
            expect(formatDateId(null)).toBe('-');
            expect(formatDateId('invalid-date')).toBe('-');
        });
    });
});
