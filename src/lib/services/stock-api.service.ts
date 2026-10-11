import { db } from '@/lib/db/db';

export interface StockBalanceItem {
    branch: string;
    warehouse: string;
    material_code: string;
    designator: string;
    qty_stock: number;
}

/**
 * Service to fetch stock balances for MTMS Public API.
 * Applies warehouse scoping:
 * - Staff: restricted only to warehouses where user is PIC 1 or PIC 2.
 * - Non-staff: can view stock balances across all warehouses.
 */
export async function getStockBalancesForApiUser(user: {
    id: string;
    nik: string;
}): Promise<StockBalanceItem[]> {
    // 1. Resolve role from hr.employees -> hr.levels
    const employee = await db
        .selectFrom('hr.employees as e')
        .leftJoin('hr.levels as l', 'l.id', 'e.level_id')
        .select(['l.level_name'])
        .where('e.nik', '=', user.nik)
        .executeTakeFirst();

    const isStaff = employee?.level_name === 'Staff';

    let allowedWarehouseIds: number[] | null = null;

    if (isStaff) {
        // Staff: resolve assigned warehouses by PIC
        const whs = await db
            .selectFrom('inventory.mas_wh')
            .select('id')
            .where((eb) => eb.or([eb('pic_1', '=', user.nik), eb('pic_2', '=', user.nik)]))
            .execute();

        allowedWarehouseIds = whs.map((w) => w.id);

        // If staff is not mapped to any warehouse, return empty list
        if (allowedWarehouseIds.length === 0) {
            return [];
        }
    }

    // 2. Fetch stock balances
    let query = db
        .selectFrom('inventory.stock_balance as sb')
        .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
        .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
        .select([
            'w.branch as branch',
            'w.name as warehouse',
            'm.code as material_code',
            'm.description as designator',
            'sb.qty_stock',
        ]);

    if (allowedWarehouseIds !== null) {
        query = query.where('sb.warehouse_id', 'in', allowedWarehouseIds);
    }

    const rows = await query
        .orderBy('w.branch', 'asc')
        .orderBy('w.name', 'asc')
        .orderBy('m.code', 'asc')
        .execute();

    return rows.map((r) => ({
        branch: r.branch ?? '-',
        warehouse: r.warehouse ?? '-',
        material_code: r.material_code ?? '-',
        designator: r.designator ?? '-',
        qty_stock: Number(r.qty_stock ?? 0),
    }));
}
