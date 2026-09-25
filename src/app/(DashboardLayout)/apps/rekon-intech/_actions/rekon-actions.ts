'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export async function getTechniciansWithIntechSaps() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let query = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .select(['t.nik', 't.name as nama_teknisi'])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0)
            .groupBy(['t.nik', 't.name'])
            .orderBy('t.name', 'asc');

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('soh.warehouse_id', 'in', warehouseIds as any);
        }

        const saps = await query.execute();

        return { success: true, data: saps };
    } catch (error: any) {
        console.error('Failed to fetch technicians:', error);
        return { success: false, error: error.message };
    }
}

export async function getTechnicianMaterials(nik: string) {
    try {
        const materials = await db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'soh.warehouse_id')
            .select([
                'soh.id as sap_out_id',
                'soh.id_trx',
                'soh.sap_number',
                'soh.name_sa',
                'wh.name as name_wh',
                'm.code as material_code',
                'm.description',
                'm.id as designator_id',
                'soi.id as sap_out_item_id',
                'soi.qty_req',
                'soi.qty_used',
            ])
            .where('soh.nik_teknisi', '=', nik)
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0)
            .orderBy('soh.id_trx', 'asc')
            .execute();

        return { success: true, data: materials };
    } catch (error: any) {
        console.error('Failed to fetch technician materials:', error);
        return { success: false, error: error.message };
    }
}

export type RekonItemPayload = {
    sap_out_id: string;
    id_trx: string;
    sap_number: string | null;
    name_sa: string;
    name_wh: string | null;
    designator_id: number;
    sap_out_item_id: string;
    qty: number;
    wo_type: any;
    wo_number: string;
    notes: string;
};

export async function submitRekonIntech(nik: string, items: RekonItemPayload[]) {
    try {
        // Group items by sap_out_id, wo_number, wo_type
        const groups: { [key: string]: RekonItemPayload[] } = {};
        for (const item of items) {
            const key = `${item.sap_out_id}_${item.wo_number}_${item.wo_type}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        }

        const createdBy = await getSessionNik();

        await db.transaction().execute(async (trx) => {
            const now = new Date();
            const yymm = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;

            // Get initial count for sequence
            const countRes = await sql<{ count: string | number }>`
        SELECT COUNT(*) as count 
        FROM inventory.transaction_used_header 
        WHERE to_char(created_at, 'YYMM') = ${yymm}
      `.execute(trx);
            let count = Number(countRes.rows[0].count);

            for (const key in groups) {
                const groupItems = groups[key];
                const first = groupItems[0];

                count++;
                const sequence = count.toString().padStart(4, '0');
                const generatedIdTrx = `TRX-USED-${nik}-${first.sap_number}-${first.wo_number}-${yymm}${sequence}`;

                // Insert Header
                const headerResult = await trx
                    .insertInto('inventory.transaction_used_header')
                    .values({
                        id_trx: generatedIdTrx,
                        sap_out_id: first.sap_out_id,
                        nik_teknisi: nik,
                        name_sa: first.name_sa,
                        name_wh: first.name_wh || '',
                        wo_number: first.wo_number,
                        wo_type: first.wo_type,
                        created_by: createdBy,
                    })
                    .returning('id')
                    .executeTakeFirstOrThrow();

                const headerId = headerResult.id;

                // Insert Items, Update sap_out_items, and call SP
                for (const item of groupItems) {
                    await trx
                        .insertInto('inventory.transaction_used_item')
                        .values({
                            used_id: headerId,
                            designator_id: item.designator_id,
                            qty: item.qty,
                            notes: item.notes || null,
                        })
                        .execute();

                    await trx
                        .updateTable('inventory.sap_out_items')
                        .set((_eb) => ({
                            qty_used: sql`COALESCE(qty_used, 0) + ${item.qty}`,
                        }))
                        .where('id', '=', item.sap_out_item_id)
                        .execute();

                    // Fetch warehouse_id from sap_out_header
                    const sap = await trx
                        .selectFrom('inventory.sap_out_header')
                        .select('warehouse_id')
                        .where('id', '=', item.sap_out_id)
                        .executeTakeFirst();
                    const warehouseId = sap?.warehouse_id || 0;

                    await sql`CALL inventory.sp_record_material_used(${warehouseId}, ${item.designator_id}, ${item.qty}, ${generatedIdTrx}, ${item.notes || null}, ${createdBy})`.execute(
                        trx
                    );
                }

                // Check if sap_out_header can be closed
                const checkRes = await sql<{ all_closed: boolean }>`
                    SELECT bool_and(qty_req = COALESCE(qty_used, 0)) as all_closed
                    FROM inventory.sap_out_items
                    WHERE header_id = ${first.sap_out_id}
                `.execute(trx);

                if (checkRes.rows[0]?.all_closed) {
                    await trx
                        .updateTable('inventory.sap_out_header')
                        .set({ end_status: 'close' })
                        .where('id', '=', first.sap_out_id as any)
                        .execute();
                }
            }
        });

        revalidatePath('/apps/rekon-intech');
        return { success: true };
    } catch (error: any) {
        console.error('Failed to submit Rekon Intech:', error);
        return { success: false, error: error.message };
    }
}
