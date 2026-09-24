'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export async function getAvailableSapOuts() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        // Only get Out SAPs where there are items with qty_req > qty_used
        let query = db
            .selectFrom('inventory.sap_out_header as h')
            .innerJoin('inventory.sap_out_items as i', 'i.header_id', 'h.id')
            .innerJoin('hr.technicians as t', 't.nik', 'h.nik_teknisi')
            .select([
                'h.id',
                'h.id_trx',
                'h.sap_number',
                'h.nik_teknisi',
                't.name as nama_teknisi',
                'h.warehouse_id',
            ])
            .where('h.end_status', '=', 'intech')
            .whereRef('i.qty_req', '>', 'i.qty_used')
            .distinct();

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('h.warehouse_id', 'in', warehouseIds as any);
        }

        const sapOuts = await query.execute();

        return { success: true, data: sapOuts };
    } catch (error: any) {
        console.error('Failed to fetch SAP Outs for return:', error);
        return { success: false, data: [] };
    }
}

export async function getSapOutItemsForReturn(headerId: number | string) {
    try {
        const items = await db
            .selectFrom('inventory.sap_out_items as i')
            .innerJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .select([
                'i.id as sap_out_item_id',
                'i.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'i.qty_req',
                'i.qty_used',
            ])
            .where('i.header_id', '=', headerId as any)
            .whereRef('i.qty_req', '>', 'i.qty_used')
            .execute();

        // Add a maxReturn field
        const mapped = items.map((item) => ({
            ...item,
            maxReturn: item.qty_req - (item.qty_used || 0),
        }));

        return { success: true, data: mapped };
    } catch (error: any) {
        console.error('Failed to fetch SAP Out items:', error);
        return { success: false, data: [] };
    }
}

export async function createReturnMaterial(payload: any) {
    try {
        const result = await db.transaction().execute(async (trx) => {
            // Get Warehouse initials
            const wh = await trx
                .selectFrom('inventory.mas_wh')
                .select('intls')
                .where('id', '=', payload.warehouse_id)
                .executeTakeFirst();
            const intls = wh?.intls || 'UNKNOWN';

            // Generate YYMM
            const now = new Date();
            const yymm = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;

            // Get Sequence
            const countRes = await sql<{ count: string | number }>`
        SELECT COUNT(*) + 1 as count 
        FROM inventory.return_material_header 
        WHERE to_char(created_at, 'YYMM') = ${yymm}
      `.execute(trx);
            const count = Number(countRes.rows[0].count);
            const sequence = count.toString().padStart(4, '0');

            const generatedIdTrx = `TRX-RETURN-${payload.nik_teknisi}-${intls}-${yymm}${sequence}`;

            const createdBy = await getSessionNik();

            // Create Header
            const headerResult = await trx
                .insertInto('inventory.return_material_header')
                .values({
                    id_trx: generatedIdTrx,
                    sap_out_id: payload.sap_out_id,
                    nik_teknisi: payload.nik_teknisi,
                    warehouse_id: payload.warehouse_id,
                    notes: payload.notes,
                    end_status: 'pending',
                    created_by: createdBy,
                })
                .returning('id')
                .executeTakeFirstOrThrow();

            if (payload.items && payload.items.length > 0) {
                const itemsToInsert = payload.items.map((item: any) => ({
                    header_id: headerResult.id,
                    designator_id: item.designator_id,
                    sap_out_item_id: item.sap_out_item_id,
                    qty: item.qty,
                }));

                await trx
                    .insertInto('inventory.return_material_items')
                    .values(itemsToInsert)
                    .execute();
            }

            return headerResult.id;
        });

        revalidatePath('/apps/return-material');
        revalidatePath('/stock-inventory');
        revalidatePath('/stock-intech');
        return { success: true, header_id: result };
    } catch (error: any) {
        console.error('Failed to create Return Material:', error);
        return { success: false, error: error.message };
    }
}
