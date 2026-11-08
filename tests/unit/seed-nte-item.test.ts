import { describe, expect, it } from 'vitest';
import { deduplicateRows, parseRows } from '../../scripts/seed-nte-item';

describe('NTE seed CSV rows', () => {
    it('keeps the last description when CSV keys repeat', () => {
        const rows = parseRows([
            '\uFEFFTYPE;MEREK;TYPE SN;ITEM DESCRIPTION',
            'ONT;FIBERHOME;FH AN 5261 DC 10G;First description',
            'ONT;FIBERHOME;FH AN 5261 DC 10G;Latest description',
        ]);

        expect(rows).toEqual([
            {
                type: 'ONT',
                merek: 'FIBERHOME',
                type_sn: 'FH AN 5261 DC 10G',
                item_description: 'Latest description',
            },
        ]);
    });

    it('distinguishes different composite unique keys', () => {
        expect(
            deduplicateRows([
                { type: 'ONT', merek: 'A', type_sn: 'X', item_description: 'one' },
                { type: 'ONT', merek: 'B', type_sn: 'X', item_description: 'two' },
            ])
        ).toHaveLength(2);
    });
});
