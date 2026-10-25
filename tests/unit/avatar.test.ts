import { describe, expect, it } from 'vitest';
import { getInitials, getProfileImageUrl } from '@/lib/avatar';

describe('avatar utils unit tests', () => {
    describe('getInitials', () => {
        it('returns U for null, undefined, or empty string', () => {
            expect(getInitials(null)).toBe('U');
            expect(getInitials(undefined)).toBe('U');
            expect(getInitials('')).toBe('U');
            expect(getInitials('   ')).toBe('U');
        });

        it('returns single letter for single word', () => {
            expect(getInitials('Budi')).toBe('B');
            expect(getInitials('agus')).toBe('A');
        });

        it('returns first two letters of first two words by default', () => {
            expect(getInitials('Budi Santoso')).toBe('BS');
            expect(getInitials('Muhammad Arif Hidayatullah')).toBe('MA');
            expect(getInitials('  John   Doe  ')).toBe('JD');
        });

        it('respects maxChars parameter', () => {
            expect(getInitials('Muhammad Arif Hidayatullah', 3)).toBe('MAH');
            expect(getInitials('Budi Santoso', 1)).toBe('B');
        });
    });

    describe('getProfileImageUrl', () => {
        it('returns undefined for invalid NIK', () => {
            expect(getProfileImageUrl(null)).toBeUndefined();
            expect(getProfileImageUrl(undefined)).toBeUndefined();
            expect(getProfileImageUrl('')).toBeUndefined();
            expect(getProfileImageUrl('   ')).toBeUndefined();
        });

        it('defaults to .jpg extension', () => {
            expect(getProfileImageUrl('20981116')).toBe('/images/profile/20981116.jpg');
        });

        it('supports .png extension', () => {
            expect(getProfileImageUrl('20981116', 'png')).toBe('/images/profile/20981116.png');
        });
    });
});
