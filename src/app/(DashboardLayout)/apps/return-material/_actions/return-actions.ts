'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

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
            query = query.where('h.warehouse_id', 'in', warehouseIds);
        }

        const sapOuts = await query.execute();

        return { success: true, data: sapOuts };
    } catch (error: unknown) {
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
    } catch (error: unknown) {
        console.error('Failed to fetch SAP Out items:', error);
        return { success: false, data: [] };
    }
}

export type ReturnMaterialPayload = {
    idemKey: string;
    sap_out_id: number;
    nik_teknisi: string;
    warehouse_id: number;
    notes?: string;
    items: {
        designator_id: number;
        sap_out_item_id: number;
        qty: number;
    }[];
};

export async function createReturnMaterial(payload: ReturnMaterialPayload) {
    if (!payload.idemKey)
        return { success: false, error: 'Security constraint: Idempotency key required' };

    try {
        const { isDuplicate, result } = await checkAndStoreIdempotency(
            payload.idemKey,
            payload,
            async (data) => {
                return await db.transaction().execute(async (trx) => {
                    // Get Warehouse initials
                    const wh = await trx
                        .selectFrom('inventory.mas_wh')
                        .select('intls')
                        .where('id', '=', data.warehouse_id)
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

                    const generatedIdTrx = `TRX-RETURN-${data.nik_teknisi}-${intls}-${yymm}${sequence}`;

                    const createdBy = await getSessionNik();

                    // Create Header
                    const headerResult = await trx
                        .insertInto('inventory.return_material_header')
                        .values({
                            id_trx: generatedIdTrx,
                            sap_out_id: data.sap_out_id,
                            nik_teknisi: data.nik_teknisi,
                            warehouse_id: data.warehouse_id,
                            notes: data.notes,
                            end_status: 'pending',
                            created_by: createdBy,
                        })
                        .returning('id')
                        .executeTakeFirstOrThrow();

                    if (data.items && data.items.length > 0) {
                        const itemsToInsert = data.items.map(
                            (item: {
                                designator_id: number;
                                sap_out_item_id: number;
                                qty: number;
                            }) => ({
                                header_id: headerResult.id,
                                designator_id: item.designator_id,
                                sap_out_item_id: item.sap_out_item_id,
                                qty: item.qty,
                            })
                        );

                        await trx
                            .insertInto('inventory.return_material_items')
                            .values(itemsToInsert)
                            .execute();
                    }

                    return headerResult.id;
                });
            }
        );

        if (isDuplicate) {
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };
        }

        revalidatePath('/apps/return-material');
        revalidatePath('/stock-inventory');
        revalidatePath('/stock-intech');
        return { success: true, header_id: result };
    } catch (error: unknown) {
        console.error('Failed to create Return Material:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
