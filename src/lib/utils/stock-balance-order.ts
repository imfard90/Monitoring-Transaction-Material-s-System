export interface StockBalanceRunoutEstimate {
    qty_stock: number;
    average_demand_weekly: number | null;
    has_out_material_history: boolean;
}

function getWeeksUntilEmpty(balance: StockBalanceRunoutEstimate): number | null {
    const averageWeekly = Number(balance.average_demand_weekly ?? 0);

    if (!balance.has_out_material_history || averageWeekly <= 0) return null;

    return Number(balance.qty_stock) / averageWeekly;
}

export function sortStockBalancesByRunout<T extends StockBalanceRunoutEstimate>(
    balances: T[]
): T[] {
    return balances
        .map((balance, index) => ({ balance, index, weeks: getWeeksUntilEmpty(balance) }))
        .sort((left, right) => {
            if (left.weeks === null) return right.weeks === null ? left.index - right.index : 1;
            if (right.weeks === null) return -1;
            return left.weeks - right.weeks || left.index - right.index;
        })
        .map(({ balance }) => balance);
}
