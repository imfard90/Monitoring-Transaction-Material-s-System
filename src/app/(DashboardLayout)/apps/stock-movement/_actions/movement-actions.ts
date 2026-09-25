'use server';

import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export async function getStockMovements(offsetMonths = 0, limitMonths = 5) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

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
            .where('sm.created_at', '<=', endDate)
            .where('sm.created_at', '>', startDate)
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
