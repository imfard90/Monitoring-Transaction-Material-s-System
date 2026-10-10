'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';

export async function getRekonEditData(header_id: string, sap_out_id: string) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        // Fetch items already in this transaction
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

        // Fetch all available items for SAP OUT
        // We will pass client to calculate 'max' allowable qty
        let sapItemsQuery = db
            .selectFrom('inventory.sap_out_items as soi')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'soi.header_id')
            .select([
                'soi.id as sap_out_item_id',
                'soi.designator_id',
                'm.code',
                'm.description',
                'soi.qty_req',
                'soi.qty_used',
            ])
            .where('soi.header_id', '=', String(sap_out_id));

        // Staff hanya boleh akses warehouse miliknya
        if (isStaff && warehouseIds.length > 0) {
            sapItemsQuery = sapItemsQuery.where('soh.warehouse_id', 'in', warehouseIds);
        }

        const sapItems = await sapItemsQuery.execute();

        return { success: true, existingItems, sapItems };
    } catch (error: unknown) {
        actionLogger.error(
            'Error getRekonEditData:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function submitEditRekon(
    _header_id: string,
    _sap_out_id: string,
    items: Array<{
        item_id?: string;
        designator_id: number;
        sap_out_item_id: string;
        new_qty: number;
        old_qty: number;
    }>
) {
    try {
        await getSessionUser();

        await db.transaction().execute(async (trx) => {
            for (const item of items) {
                const diff = item.new_qty - item.old_qty;
                if (diff === 0) continue;

                await sql`CALL inventory.sp_edit_transaction_used(
                    ${item.sap_out_item_id},
                    ${item.designator_id},
                    ${item.new_qty},
                    ${item.item_id}
                )`.execute(trx);
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
