import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
    },
}));

import { getWOPrefixes } from '@/lib/lensa-scraper/lensa-wo-scraper';

describe('WO Lensa Scraper — Prefix patterns', () => {
    it('generates DGPSyyMM and FMCyyMM based on cutoff date (October 2026)', () => {
        const testDate = new Date(2026, 9, 1); // 2026-10-01
        const prefixes = getWOPrefixes(testDate);

        expect(prefixes).toEqual(['INC', 'SC', 'DGPS2610', 'FMC2610', 'PDA']);
    });

    it('generates correct yyMM for different months and years', () => {
        // November 2026
        expect(getWOPrefixes(new Date(2026, 10, 1))).toEqual([
            'INC',
            'SC',
            'DGPS2611',
            'FMC2611',
            'PDA',
        ]);

        // January 2027
        expect(getWOPrefixes(new Date(2027, 0, 1))).toEqual([
            'INC',
            'SC',
            'DGPS2701',
            'FMC2701',
            'PDA',
        ]);
    });
});
