'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { warehouseScope } from '@/lib/policies';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createInventoryRepository } from '@/lib/repositories';

const editRekonAccessSchema = z.object({
    header_id: z.string().regex(/^\d+$/),
    sap_out_id: z.string().regex(/^\d+$/),
});

export async function getRekonEditData(header_id: string, sap_out_id: string) {
    try {
        const parsed = editRekonAccessSchema.safeParse({ header_id, sap_out_id });
        if (!parsed.success) return { success: false, error: 'ID transaksi tidak valid' };

        const { isStaff, warehouseIds } = await getSessionUser();
        if (isStaff && warehouseIds.length === 0) {
            return { success: true, existingItems: [], sapItems: [] };
        }

        const accessQuery = db
            .selectFrom('inventory.transaction_used_header as tuh')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'tuh.sap_out_id')
            .select('tuh.id')
            .where('tuh.id', '=', parsed.data.header_id)
            .where('soh.id', '=', parsed.data.sap_out_id);
        const scopedAccessQuery = isStaff
            ? accessQuery.where('soh.warehouse_id', 'in', warehouseIds)
            : accessQuery;
        if (!(await scopedAccessQuery.executeTakeFirst())) {
            return { success: false, error: 'Transaksi tidak ditemukan atau akses ditolak' };
        }

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

        // Staff hanya boleh akses warehouse miliknya (fail-closed)
        if (isStaff) {
            if (warehouseIds.length === 0) {
                return { success: true, existingItems: [], sapItems: [] };
            }
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

const submitEditRekonSchema = z.object({
    headerId: z.string().regex(/^\d+$/),
    sapOutId: z.string().regex(/^\d+$/),
    items: z.array(
        z.object({
            item_id: z.string().regex(/^\d+$/).optional(),
            designator_id: z.number().int().positive(),
            sap_out_item_id: z.string().regex(/^\d+$/),
            new_qty: z.number().nonnegative(),
            old_qty: z.number().nonnegative(),
        })
    ),
});

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
        const parsed = submitEditRekonSchema.safeParse({
            headerId: _header_id,
            sapOutId: _sap_out_id,
            items,
        });
        if (!parsed.success) return { success: false, error: 'Data edit rekon tidak valid' };

        const { isStaff, warehouseIds } = await getSessionUser();
        if (isStaff && warehouseIds.length === 0) {
            return { success: false, error: 'Akses gudang tidak tersedia' };
        }
        const createdBy = await getSessionNik();
        const headerQuery = db
            .selectFrom('inventory.transaction_used_header as tuh')
            .innerJoin('inventory.sap_out_header as soh', 'soh.id', 'tuh.sap_out_id')
            .select('tuh.id')
            .where('tuh.id', '=', parsed.data.headerId)
            .where('soh.id', '=', parsed.data.sapOutId);
        const scopedHeaderQuery = isStaff
            ? headerQuery.where('soh.warehouse_id', 'in', warehouseIds)
            : headerQuery;
        if (!(await scopedHeaderQuery.executeTakeFirst())) {
            return { success: false, error: 'Transaksi tidak ditemukan atau akses ditolak' };
        }

        if (items.length > 0) {
            const itemQuery = db
                .selectFrom('inventory.sap_out_items as soi')
                .select(['soi.id', 'soi.designator_id'])
                .where('soi.header_id', '=', parsed.data.sapOutId)
                .where(
                    'soi.id',
                    'in',
                    items.map((item) => item.sap_out_item_id)
                );
            const validItems = await itemQuery.execute();
            if (
                validItems.length !== items.length ||
                validItems.some((validItem) => {
                    const item = items.find(
                        (candidate) => candidate.sap_out_item_id === validItem.id
                    );
                    return (
                        !item ||
                        item.designator_id.toString() !== validItem.designator_id.toString()
                    );
                })
            ) {
                return { success: false, error: 'Item tidak sesuai dengan transaksi SAP Out' };
            }
        }

        await db.transaction().execute(async (trx) => {
            const repo = createInventoryRepository(trx);
            for (const item of items) {
                const diff = item.new_qty - item.old_qty;
                if (diff === 0) continue;

                await repo.editTransactionUsed({
                    usedItemId: item.item_id ? Number(item.item_id) : null,
                    usedHeaderId: Number(_header_id),
                    sapOutItemId: Number(item.sap_out_item_id),
                    designatorId: item.designator_id,
                    newQty: item.new_qty,
                    oldQty: item.old_qty,
                    createdBy,
                });
            }
        });

        revalidatePath('/apps/hasil-rekon');
        revalidatePath('/apps/out-material');
        revalidatePath('/stock-intech');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Error submitEditRekon:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
