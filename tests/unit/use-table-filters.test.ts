import { describe, expect, it } from 'vitest';
import { buildTableFilterParams } from '@/hooks/use-table-filters';

describe('buildTableFilterParams', () => {
    it('writes page and pageSize when provided', () => {
        const params = buildTableFilterParams({ page: 2, pageSize: 50 });
        expect(params.get('page')).toBe('2');
        expect(params.get('pageSize')).toBe('50');
    });

    it('trims and writes a non-empty search term', () => {
        const params = buildTableFilterParams({ search: '  kabel optik  ' });
        expect(params.get('search')).toBe('kabel optik');
    });

    it('omits search when it is blank', () => {
        const params = buildTableFilterParams({ search: '   ' });
        expect(params.has('search')).toBe(false);
    });

    it('omits the warehouse param when the selection is "all"', () => {
        const params = buildTableFilterParams({ warehouse: 'all' });
        expect(params.has('warehouse')).toBe(false);
    });

    it('writes the warehouse param when a warehouse is selected', () => {
        const params = buildTableFilterParams({ warehouse: 'SO Karangpilang' });
        expect(params.get('warehouse')).toBe('SO Karangpilang');
    });

    it('skips extra params that are undefined', () => {
        const params = buildTableFilterParams({}, { status: undefined });
        expect(params.has('status')).toBe(false);
    });

    it('skips extra params whose value is "all" or an empty string', () => {
        const params = buildTableFilterParams({}, { status: 'all', material: '' });
        expect(params.has('status')).toBe(false);
        expect(params.has('material')).toBe(false);
    });

    it('writes extra params with a concrete value', () => {
        const params = buildTableFilterParams({}, { status: 'pending', page: 3 });
        expect(params.get('status')).toBe('pending');
        expect(params.get('page')).toBe('3');
    });

    it('writes null extra params as an empty string so the key is still present', () => {
        const params = buildTableFilterParams({}, { startDate: null });
        expect(params.has('startDate')).toBe(true);
        expect(params.get('startDate')).toBe('');
    });
});
