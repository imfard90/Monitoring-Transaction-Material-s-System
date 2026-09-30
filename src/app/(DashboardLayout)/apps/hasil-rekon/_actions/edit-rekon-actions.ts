'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

export async function getRekonEditData(header_id: string, sap_out_id: string) {
    try {
        // Fetch items that are already in this transaction
        const existingItems = await db
            .selectFrom('inventory.transaction_used_item as tui')
            .innerJoin('inventory.materials as m', 'm.id', 'tui.designator_id')
            .select([
                'tui.id as item_id',
                'tui.designator_id',
                'm.code',
                'm.description',
                'tui.qty as current_qty',
            ])
            .where('tui.used_id', '=', header_id)
            .execute();

        // Fetch all available items for this SAP OUT
        // We will pass this to the client to calculate the 'max' allowable qty
        const sapItems = await db
            .selectFrom('inventory.sap_out_items as soi')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .select([
                'soi.id as sap_out_item_id',
                'soi.designator_id',
                'm.code',
                'm.description',
                'soi.qty_req',
                'soi.qty_used',
            ])
            .where('soi.header_id', '=', String(sap_out_id) as any) // Based on the db type, it might be string or number
            .execute();

        return { success: true, existingItems, sapItems };
    } catch (error) {
        actionLogger.error(
            'Error getRekonEditData:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal memuat data rekon' };
    }
}

export async function submitEditRekon(
    header_id: string,
    sap_out_id: string,
    updatedItems: {
        item_id?: string;
        designator_id: number;
        sap_out_item_id: string;
        new_qty: number;
        old_qty: number;
    }[]
) {
    try {
        const createdBy = await getSessionNik();

        await db.transaction().execute(async (trx) => {
            for (const item of updatedItems) {
                const diff = item.new_qty - item.old_qty;

                if (diff !== 0) {
                    // Update qty_used in sap_out_items
                    await trx
                        .updateTable('inventory.sap_out_items')
                        .set((_eb) => ({
                            qty_used: sql`COALESCE(qty_used, 0) + ${diff}`,
                        }))
                        .where('id', '=', item.sap_out_item_id)
                        .execute();

                    if (item.item_id) {
                        // Update existing transaction_used_item
                        await trx
                            .updateTable('inventory.transaction_used_item')
                            .set({ qty: item.new_qty })
                            .where('id', '=', item.item_id)
                            .execute();
                    } else {
                        // Insert new transaction_used_item
                        await trx
                            .insertInto('inventory.transaction_used_item')
                            .values({
                                used_id: header_id,
                                designator_id: item.designator_id,
                                qty: item.new_qty,
                            })
                            .execute();
                    }

                    // SP sp_record_material_used is generally for insertions, but since we are modifying,
                    // we might need to adjust stock if stock balance is strictly bound to this.
                    // Wait, the bispro says transaction_used decreases stock.
                    // If we just updated transaction_used_item, we might need a specific SP for updating,
                    // or just let it be if we only care about tracking SAP.
                    // Let's call a compensation SP if exists, or re-run the record SP with the diff!
                    // Wait, sp_record_material_used uses qty as an absolute decrease. So we can just pass the diff.

                    const sap = await trx
                        .selectFrom('inventory.sap_out_header')
                        .select('warehouse_id')
                        .where('id', '=', String(sap_out_id) as any)
                        .executeTakeFirst();

                    const warehouseId = sap?.warehouse_id || 0;

                    // Pass diff to SP (if diff is negative, it will add stock back!)
                    // We need to fetch id_trx to pass to the SP
                    const header = await trx
                        .selectFrom('inventory.transaction_used_header')
                        .select('id_trx')
                        .where('id', '=', header_id)
                        .executeTakeFirst();

                    if (header) {
                        await sql`CALL inventory.sp_record_material_used(${warehouseId}, ${item.designator_id}, ${diff}, ${header.id_trx}, 'Edit Rekon Qty', ${createdBy})`.execute(
                            trx
                        );
                    }
                }
            }

            // Check if SAP out needs to be un-closed or closed
            const checkRes = await sql<{ all_closed: boolean }>`
                SELECT bool_and(qty_req = COALESCE(qty_used, 0)) as all_closed
                FROM inventory.sap_out_items
                WHERE header_id = ${String(sap_out_id)}
            `.execute(trx);

            await trx
                .updateTable('inventory.sap_out_header')
                .set({ end_status: checkRes.rows[0]?.all_closed ? 'close' : 'intech' })
                .where('id', '=', String(sap_out_id))
                .execute();
        });

        revalidatePath('/apps/hasil-rekon');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Error submitEditRekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
