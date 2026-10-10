'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
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
        actionLogger.error(
            'Failed to fetch SAP Outs for return:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getSapOutItemsForReturn(headerId: number | string) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let query = db
            .selectFrom('inventory.sap_out_items as i')
            .innerJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .innerJoin('inventory.sap_out_header as h', 'h.id', 'i.header_id')
            .select([
                'i.id as sap_out_item_id',
                'i.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'i.qty_req',
                'i.qty_used',
            ])
            .where('i.header_id', '=', String(headerId))
            .whereRef('i.qty_req', '>', 'i.qty_used');

        // Staff hanya boleh akses item dari warehouse miliknya
        if (isStaff && warehouseIds.length > 0) {
            query = query.where('h.warehouse_id', 'in', warehouseIds);
        }

        const items = await query.execute();

        // Add a maxReturn field
        const mapped = items.map((item) => ({
            ...item,
            maxReturn: item.qty_req - (item.qty_used || 0),
        }));

        return { success: true, data: mapped };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch SAP Out items:',
            error instanceof Error ? error : new Error(String(error))
        );
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
                    const createdBy = await getSessionNik();

                    const resultId = await sql<{ id_trx: string }>`
                        SELECT inventory.sp_create_return_request(
                            ${data.sap_out_id},
                            ${data.nik_teknisi},
                            ${data.warehouse_id},
                            ${data.notes || null},
                            ${JSON.stringify(data.items)}::jsonb,
                            ${createdBy}
                        ) as id_trx
                    `.execute(trx);

                    return resultId.rows[0]?.id_trx;
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
        actionLogger.error(
            'Failed to create Return Material:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
