import { describe, expect, it } from 'vitest';

import { getNteTagOptions } from '@/lib/nte-tag-options';

describe('getNteTagOptions', () => {
    it('preserves the reference rows returned by server actions', () => {
        const addresses = [{ address_name: 'wh-a', ui_label: 'Warehouse A', owner: 'telkom' }];
        const items = [{ id: '1', item_description: 'Router', type: 'ONT', merek: 'Brand' }];

        expect(getNteTagOptions(addresses, items)).toEqual({
            addressOptions: addresses,
            itemOptions: items,
        });
    });

    it('deduplicates item descriptions for searchable dropdown options', () => {
        const items = [
            { id: '1', item_description: 'Router', type: 'ONT', merek: 'Brand A' },
            { id: '2', item_description: 'Router', type: 'ONT', merek: 'Brand B' },
            { id: '3', item_description: 'Modem', type: 'ONT', merek: 'Brand C' },
        ];

        expect(getNteTagOptions([], items).itemOptions).toEqual([items[0], items[2]]);
    });

    it('uses empty lists when an action has no data', () => {
        expect(getNteTagOptions(undefined, undefined)).toEqual({
            addressOptions: [],
            itemOptions: [],
        });
    });
});
