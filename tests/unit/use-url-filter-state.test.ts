import { describe, expect, it } from 'vitest';
import { buildFilteredUrl } from '@/hooks/use-url-filter-state';

describe('buildFilteredUrl', () => {
    it('generates base URL when no query params are provided', () => {
        const url = buildFilteredUrl({
            basePath: '/reference/wo-lensa-ref',
        });
        expect(url).toBe('/reference/wo-lensa-ref');
    });

    it('appends trimmed search parameter', () => {
        const url = buildFilteredUrl({
            basePath: '/reference/wo-lensa-ref',
            search: '  kabel optik  ',
        });
        expect(url).toBe('/reference/wo-lensa-ref?search=kabel+optik');
    });

    it('removes search parameter if empty string', () => {
        const url = buildFilteredUrl({
            basePath: '/reference/wo-lensa-ref',
            search: '',
            currentSearchString: 'search=old&page=2',
        });
        expect(url).toBe('/reference/wo-lensa-ref?page=2');
    });

    it('appends warehouse parameter and canonicalizes name', () => {
        const url = buildFilteredUrl({
            basePath: '/reference/out-lensa-ref',
            warehouse: 'SO Karang Pilang',
        });
        expect(url).toBe('/reference/out-lensa-ref?warehouse=SO+Karangpilang');
    });

    it('deletes warehouse parameter when set to all', () => {
        const url = buildFilteredUrl({
            basePath: '/reference/out-lensa-ref',
            warehouse: 'all',
            currentSearchString: 'warehouse=Gresik&page=3',
        });
        expect(url).toBe('/reference/out-lensa-ref?page=3');
    });

    it('resets or updates page parameter correctly', () => {
        const url = buildFilteredUrl({
            basePath: '/reference/out-lensa-ref',
            page: 1,
            currentSearchString: 'warehouse=Gresik&page=5',
        });
        expect(url).toBe('/reference/out-lensa-ref?warehouse=Gresik');

        const urlPage2 = buildFilteredUrl({
            basePath: '/reference/out-lensa-ref',
            page: 2,
            currentSearchString: 'warehouse=Gresik',
        });
        expect(urlPage2).toBe('/reference/out-lensa-ref?warehouse=Gresik&page=2');
    });
});
