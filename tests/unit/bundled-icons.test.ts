import { describe, expect, it } from 'vitest';
import { getIcon } from '@iconify/react';
import '@/lib/icons/register-icons';

describe('Locally Bundled Icons', () => {
    it('registers essential solar, lucide, mdi, and ri icons into memory storage', () => {
        // Solar icons (sample)
        expect(getIcon('solar:bell-linear')).toBeDefined();
        expect(getIcon('solar:home-2-bold')).toBeDefined();
        expect(getIcon('solar:magnifer-linear')).toBeDefined();

        // Lucide icons (sample)
        expect(getIcon('lucide:shield-check')).toBeDefined();
        expect(getIcon('lucide:database')).toBeDefined();
        expect(getIcon('lucide:key-round')).toBeDefined();

        // MDI / RI icons (sample)
        expect(getIcon('mdi:refresh')).toBeDefined();
        expect(getIcon('ri:checkbox-blank-circle-line')).toBeDefined();
    });

    it('each icon contains body svg string without requiring runtime HTTP fetch', () => {
        const bell = getIcon('solar:bell-linear');
        expect(bell?.body).toBeTruthy();
        expect(typeof bell?.body).toBe('string');
        expect(bell?.body.length).toBeGreaterThan(10);
    });
});
