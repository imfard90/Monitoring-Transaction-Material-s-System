import { describe, expect, it } from 'vitest';
import { sortStockBalancesByRunout } from '@/lib/utils/stock-balance-order';

describe('sortStockBalancesByRunout', () => {
    it('sorts balances by shortest estimated weeks remaining', () => {
        const balances = [
            { qty_stock: 60, average_demand_weekly: 10, has_out_material_history: true },
            { qty_stock: 15, average_demand_weekly: 10, has_out_material_history: true },
            { qty_stock: 40, average_demand_weekly: 10, has_out_material_history: true },
        ];

        expect(sortStockBalancesByRunout(balances)).toEqual([
            balances[1],
            balances[2],
            balances[0],
        ]);
    });

    it('places balances without a valid estimate last and preserves their order', () => {
        const balances = [
            { qty_stock: 5, average_demand_weekly: 0, has_out_material_history: true },
            { qty_stock: 20, average_demand_weekly: 10, has_out_material_history: true },
            { qty_stock: 1, average_demand_weekly: null, has_out_material_history: false },
            { qty_stock: 0, average_demand_weekly: 10, has_out_material_history: true },
        ];

        expect(sortStockBalancesByRunout(balances)).toEqual([
            balances[3],
            balances[1],
            balances[0],
            balances[2],
        ]);
    });
});
