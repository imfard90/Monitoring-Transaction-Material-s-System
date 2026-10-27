'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionNik, getSessionUser, requireWarehouseAccess } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { inventoryRepository } from '@/lib/repositories';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

export async function getAvailableSapOuts() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        if (isStaff && warehouseIds.length === 0) {
            return { success: true, data: [] };
        }

        // Only get Out SAPs where there are items with qty_req > qty_used
        let query = db
            .selectFrom('inventory.sap_out_header as h')
            .innerJoin('inventory.sap_out_items as i', 'i.header_id', 'h.id')
            .innerJoin('hr.technicians as t', 't.nik', 'h.nik_teknisi')
            .select([
                'h.id',
                'h.id_trx',
                'h.request_id',
                'h.sap_number',
                'h.nik_teknisi',
                't.name as nama_teknisi',
                'h.warehouse_id',
            ])
            .where('h.end_status', '=', 'intech')
            .whereRef('i.qty_req', '>', 'i.qty_used')
            .distinct();

        if (isStaff) {
            if (warehouseIds.length === 0) {
                return { success: true, data: [] };
            }
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
        if (isStaff && warehouseIds.length === 0) {
            return { success: true, data: [] };
        }

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
                sql<number>`COALESCE((
                    SELECT SUM(rmi.qty) 
                    FROM inventory.return_material_items rmi 
                    JOIN inventory.return_material_header rmh ON rmh.id = rmi.header_id 
                    WHERE rmi.sap_out_item_id = i.id 
                      AND rmh.end_status IN ('wait_approve', 'pending')
                ), 0)`.as('pending_returns'),
            ])
            .where('i.header_id', '=', String(headerId));

        // Staff hanya boleh akses item dari warehouse miliknya
        if (isStaff) {
            if (warehouseIds.length === 0) {
                return { success: true, data: [] };
            }
            query = query.where('h.warehouse_id', 'in', warehouseIds);
        }

        const items = await query.execute();

        // Calculate actual available maxReturn:
        // (Note: accepted returns are already incorporated into qty_used via sp_return_material.
        // Therefore, we only subtract pending_returns that have not yet been accepted)
        const mapped = items
            .map((item) => {
                const req = Number(item.qty_req || 0);
                const used = Number(item.qty_used || 0);
                const pending = Number(item.pending_returns || 0);
                const maxReturn = Math.max(0, req - used - pending);
                return {
                    ...item,
                    maxReturn,
                };
            })
            .filter((item) => item.maxReturn > 0);

        return { success: true, data: mapped };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch SAP Out items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

const createReturnMaterialSchema = z.object({
    idemKey: z.string().min(1, 'Idempotency key wajib diisi'),
    sap_out_id: z.number().int().positive('ID SAP Out tidak valid'),
    nik_teknisi: z.string().min(1, 'NIK teknisi wajib diisi'),
    warehouse_id: z.number().int().positive('Gudang tujuan tidak valid'),
    notes: z.string().optional().nullable(),
    items: z
        .array(
            z.object({
                designator_id: z.number().int().positive(),
                sap_out_item_id: z.number().int().positive(),
                qty: z.number().positive('Jumlah return harus lebih dari 0'),
            })
        )
        .min(1, 'Minimal satu material harus direturn'),
});

export type ReturnMaterialPayload = z.infer<typeof createReturnMaterialSchema>;

export async function createReturnMaterial(payload: ReturnMaterialPayload) {
    if (!payload.idemKey) {
        return { success: false, error: 'Security constraint: Idempotency key required' };
    }

    const parsed = createReturnMaterialSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: `Invalid input data: ${parsed.error.issues[0].message}` };
    }

    try {
        // Enforce fail-closed warehouse authorization
        await requireWarehouseAccess(parsed.data.warehouse_id);

        const { isDuplicate, result } = await checkAndStoreIdempotency(
            parsed.data.idemKey,
            parsed.data,
            async (data) => {
                const createdBy = await getSessionNik();
                return await inventoryRepository.createReturnRequest({
                    sapOutId: data.sap_out_id,
                    nikTeknisi: data.nik_teknisi,
                    warehouseId: data.warehouse_id,
                    notes: data.notes ?? null,
                    items: data.items,
                    createdBy,
                });
            }
        );

        if (isDuplicate) {
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };
        }

        revalidatePath('/form/return-material');
        revalidatePath('/apps/inout-tag');
        revalidatePath('/apps/out-material');
        revalidatePath('/stock-inventory');
        revalidatePath('/stock-intech');
        revalidatePath('/form/rekon-intech');
        revalidatePath('/form/rekon-lensa');
        revalidatePath('/');
        return { success: true, id_trx: result, header_id: result };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to create Return Material:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
