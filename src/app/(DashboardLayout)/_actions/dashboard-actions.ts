'use server';

import { sql } from 'kysely';
import { db } from '@/lib/db/db';

export async function getStockBalances() {
    try {
        const balances = await db
            .selectFrom('inventory.stock_balance as sb')
            .innerJoin('inventory.mas_wh as w', 'w.id', 'sb.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'sb.designator_id')
            .select([
                'sb.id',
                'sb.warehouse_id',
                'w.name as warehouse_name',
                'w.branch as branch_name',
                'sb.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'sb.qty_stock',
            ])
            .orderBy('w.name', 'asc')
            .orderBy('m.code', 'asc')
            .execute();

        return { success: true, data: balances };
    } catch (error: any) {
        console.error('Failed to fetch stock balances:', error);
        return { success: false, error: error.message };
    }
}

export async function getDashboardStockIntech() {
    try {
        const data = await db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .leftJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'soh.warehouse_id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'wh.branch as branch',
                'wh.name as wh_name',
                't.name as teknisi',
                'm.code as material_code',
                'm.description as material_name',
                sql<number>`soi.qty_req - COALESCE(soi.qty_used, 0)`.as('qty_intech'),
            ])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0)
            .orderBy('wh.branch', 'asc')
            .orderBy('t.name', 'asc')
            .execute();

        return { success: true, data };
    } catch (error: any) {
        console.error('Failed to fetch dashboard stock intech:', error);
        return { success: false, error: error.message };
    }
}
