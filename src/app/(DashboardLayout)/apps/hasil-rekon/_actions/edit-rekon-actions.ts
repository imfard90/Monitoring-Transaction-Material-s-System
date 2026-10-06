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
            .where('soi.header_id', '=', String(sap_out_id) as string) // Based on the db type, it might be string or number
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
                if (item.new_qty !== item.old_qty) {
                    await sql`
                        CALL inventory.sp_edit_transaction_used(
                            ${header_id},
                            ${sap_out_id},
                            ${item.sap_out_item_id},
                            ${item.designator_id},
                            ${item.new_qty},
                            ${item.item_id || null},
                            ${createdBy}
                        )
                    `.execute(trx);
                }
            }
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
