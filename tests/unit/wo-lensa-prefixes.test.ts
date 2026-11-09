import { describe, expect, it } from 'vitest';
import { getWOPrefixes } from '@/lib/lensa-scraper/lensa-wo-helpers';

describe('WO Lensa Scraper — Prefix patterns', () => {
    it('generates static and dynamic prefixes for a single target month', () => {
        const testDate = new Date(2026, 9, 1); // 2026-10-01
        const prefixes = getWOPrefixes(testDate, testDate);

        expect(prefixes).toContain('INC');
        expect(prefixes).toContain('SC');
        expect(prefixes).toContain('PDA');
        expect(prefixes).toContain('2610');
        expect(prefixes).toContain('DGPS2610');
        expect(prefixes).toContain('FMC2610');
        expect(prefixes).toContain('AOi42610');
        expect(prefixes).toContain('AOk42610');
    });

    it('generates dynamic multi-month range when cutoff date is in the past', () => {
        const cutoffDate = new Date(2026, 9, 1); // October 2026
        const now = new Date(2026, 10, 9); // November 2026
        const prefixes = getWOPrefixes(cutoffDate, now);

        // Harus mencakup kedua bulan (2610 dan 2611)
        expect(prefixes).toContain('2610');
        expect(prefixes).toContain('DGPS2610');
        expect(prefixes).toContain('FMC2610');
        expect(prefixes).toContain('2611');
        expect(prefixes).toContain('DGPS2611');
        expect(prefixes).toContain('FMC2611');
        expect(prefixes).toContain('AOi42611');
        expect(prefixes).toContain('AOk42611');
    });

    it('generates correct yyMM for different months and future years', () => {
        const test2027 = new Date(2027, 0, 1);
        const prefixes = getWOPrefixes(test2027, test2027);

        expect(prefixes).toContain('INC');
        expect(prefixes).toContain('SC');
        expect(prefixes).toContain('PDA');
        expect(prefixes).toContain('2701');
        expect(prefixes).toContain('DGPS2701');
        expect(prefixes).toContain('FMC2701');
    });
});
