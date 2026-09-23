'use server';

import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export async function getStockMovements() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let query = db
            .selectFrom('inventory.stock_movement as sm')
            .leftJoin('inventory.mas_wh as w', 'w.id', 'sm.warehouse_id')
            .leftJoin('inventory.materials as m', 'm.id', 'sm.designator_id')
            .select([
                'sm.id',
                'sm.created_at',
                'sm.movement_type',
                'sm.qty_delta',
                'sm.qty_after',
                'sm.reference_trx',
                'sm.notes',
                'sm.created_by',
                'w.name as warehouse_name',
                'm.code as material_code',
                'm.description as material_name',
            ])
            .orderBy('sm.created_at', 'desc');

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('sm.warehouse_id', 'in', warehouseIds as any);
        }

        const movements = await query.execute();
        return movements;
    } catch (error) {
        console.error('Error fetching stock movements:', error);
        return [];
    }
}
