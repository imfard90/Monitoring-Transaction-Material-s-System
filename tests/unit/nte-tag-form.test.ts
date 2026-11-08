import { describe, expect, it } from 'vitest';
import { nteTagFormSchema } from '@/lib/nte-tag-form';

describe('nteTagFormSchema', () => {
    it('accepts the required address fields without requiring a second SN list', () => {
        expect(nteTagFormSchema.safeParse({ asal: 'WH-A', tujuan: 'WH-B' }).success).toBe(true);
    });

    it('rejects missing source or destination', () => {
        expect(nteTagFormSchema.safeParse({ asal: '', tujuan: 'WH-B' }).success).toBe(false);
        expect(nteTagFormSchema.safeParse({ asal: 'WH-A', tujuan: '' }).success).toBe(false);
    });
});
