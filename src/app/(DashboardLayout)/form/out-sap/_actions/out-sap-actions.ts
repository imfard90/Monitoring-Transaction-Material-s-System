'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { hrRepository } from '@/lib/repositories/hr.repository';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

const createOutSapSchema = z.object({
    idemKey: z.string().min(1),
    warehouse_id: z.number().int().positive(),
    nik_teknisi: z.string().min(1),
    name_sa: z.string(),
    id_reservasi: z.string(),
    sap_number: z.string(),
    request_id: z.string(),
    items: z
        .array(
            z.object({
                designator_id: z.number().int().positive(),
                qty_req: z.number().positive(),
                unit_price: z.number().nonnegative().optional(),
            })
        )
        .optional(),
});

export async function getOutSaps() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let sapQuery = db
            .selectFrom('inventory.sap_out_header as soh')
            .leftJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .leftJoin('inventory.mas_wh as w', 'w.id', 'soh.warehouse_id')
            .select([
                'soh.id',
                'soh.id_trx',
                'soh.nik_teknisi',
                't.name as nama_teknisi',
                'soh.name_sa',
                'soh.warehouse_id',
                'w.name as nama_gudang',
                'soh.id_reservasi',
                'soh.sap_number',
                'soh.request_id',
                'soh.request_time',
                'soh.end_status',
            ])
            .orderBy('soh.request_time', 'desc');

        let countQuery = db.selectFrom('inventory.sap_out_header');

        if (isStaff && warehouseIds.length > 0) {
            sapQuery = sapQuery.where('soh.warehouse_id', 'in', warehouseIds as number[]);
            countQuery = countQuery.where('warehouse_id', 'in', warehouseIds as number[]);
        }

        // P2 audit fix: add default LIMIT to prevent unbounded result sets
        const saps = await sapQuery.limit(200).execute();

        const resultCount = await countQuery
            .select([
                sql<number>`SUM(CASE WHEN end_status = 'wait_approve' THEN 1 ELSE 0 END)`.as(
                    'wait_approve'
                ),
                sql<number>`SUM(CASE WHEN end_status = 'request' THEN 1 ELSE 0 END)`.as('request'),
                sql<number>`SUM(CASE WHEN end_status = 'intech' THEN 1 ELSE 0 END)`.as('intech'),
                sql<number>`SUM(CASE WHEN end_status = 'close' THEN 1 ELSE 0 END)`.as('close'),
            ])
            .executeTakeFirst();

        const counts = {
            wait_approve: Number(resultCount?.wait_approve || 0),
            request: Number(resultCount?.request || 0),
            intech: Number(resultCount?.intech || 0),
            close: Number(resultCount?.close || 0),
        };

        return { success: true, data: saps, counts };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch Out SAPs:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getOutSapItemsByHeaderId(headerId: number | string) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let query = db
            .selectFrom('inventory.sap_out_items as i')
            .innerJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .innerJoin('inventory.sap_out_header as h', 'h.id', 'i.header_id')
            .select([
                'i.id',
                'i.header_id',
                'i.designator_id',
                'm.code as material_code',
                'm.description as material_name',
                'i.qty_req',
                'i.qty_used',
                'i.unit_price',
            ])
            .where('i.header_id', '=', String(headerId));

        // Staff hanya boleh melihat item dari warehouse miliknya
        if (isStaff && warehouseIds.length > 0) {
            query = query.where('h.warehouse_id', 'in', warehouseIds);
        }

        const items = await query.execute();

        return { success: true, data: items };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch items:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getTechnicianByNik(nik: string) {
    try {
        await getSessionUser();

        const t = await hrRepository.getTechnicianByNik(nik);
        return { success: true, data: t };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch technician by nik:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: null };
    }
}

export async function getTechnicians(sa?: string) {
    try {
        const technicians = await hrRepository.getTechnicians(sa ? { serviceArea: sa } : undefined);
        return { success: true, data: technicians };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch technicians:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getMaterials() {
    try {
        const mats = await db.selectFrom('inventory.materials').selectAll().execute();
        return { success: true, data: mats };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getMaterialsInWarehouse(whId: number) {
    try {
        const mats = await db
            .selectFrom('inventory.materials as m')
            .innerJoin('inventory.stock_balance as sb', 'm.id', 'sb.designator_id')
            .select(['m.id', 'm.code', 'm.description', 'sb.qty_stock as qty'])
            .where('sb.warehouse_id', '=', whId)
            .where('sb.qty_stock', '>', 0)
            .execute();
        return { success: true, data: mats };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching materials for warehouse:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getWarehouses() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        let query = db.selectFrom('inventory.mas_wh').selectAll();

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('id', 'in', warehouseIds);
        } else if (isStaff && warehouseIds.length === 0) {
            return { success: true, data: [] };
        }

        const whs = await query.execute();
        return { success: true, data: whs };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function getBranches() {
    try {
        const { branchName } = await getSessionUser();
        const branches = await hrRepository.getBranches(branchName ? { branchName } : undefined);
        return { success: true, data: branches };
    } catch (error: unknown) {
        actionLogger.error(
            'Error fetching branches:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, data: [] };
    }
}

export async function createOutSap(payload: {
    idemKey: string;
    warehouse_id: number;
    nik_teknisi: string;
    name_sa: string;
    id_reservasi: string;
    sap_number: string;
    request_id: string;
    items?: { designator_id: number; qty_req: number; unit_price?: number }[];
}) {
    if (!payload.idemKey)
        return { success: false, error: 'Security constraint: Idempotency key required' };

    const parsed = createOutSapSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: `Invalid input data: ${parsed.error.issues[0].message}` };
    }

    try {
        const { isDuplicate, result } = await checkAndStoreIdempotency(
            payload.idemKey,
            payload,
            async (data) => {
                const createdBy = await getSessionNik();
                return await inventoryRepository.createOutSap({
                    warehouseId: data.warehouse_id,
                    nikTeknisi: data.nik_teknisi,
                    nameSa: data.name_sa,
                    idReservasi: data.id_reservasi || null,
                    sapNumber: data.sap_number,
                    requestId: data.request_id,
                    createdBy,
                    items: data.items ?? [],
                });
            }
        );

        if (isDuplicate) {
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };
        }

        revalidatePath('/stock-intech');
        revalidatePath('/stock-inventory');
        revalidatePath('/apps/out-material');
        return { success: true, header_id: result.headerId, id_trx: result.idTrx };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to create Out SAP:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// Additional action to update status to intech, triggering SP reduction
export async function updateOutSapStatusToIntech(headerId: number | string) {
    try {
        const _result = await db.transaction().execute(async (trx) => {
            // Set to intech
            await trx
                .updateTable('inventory.sap_out_header')
                .set({ end_status: 'intech' })
                .where('id', '=', String(headerId))
                .execute();

            // Get warehouse_id first
            const header = await trx
                .selectFrom('inventory.sap_out_header')
                .select(['warehouse_id'])
                .where('id', '=', String(headerId))
                .executeTakeFirst();

            const warehouseId = header?.warehouse_id;
            const createdBy = await getSessionNik();

            // Call SP sp_sap_out for this header to reduce stock
            await inventoryRepository.recordSapOut({
                headerId: Number(headerId),
                warehouseId: Number(warehouseId),
                createdBy,
            });

            return true;
        });

        revalidatePath('/stock-intech');
        revalidatePath('/stock-inventory');
        revalidatePath('/apps/out-material');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to update status to intech:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
