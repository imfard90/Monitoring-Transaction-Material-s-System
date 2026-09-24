'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

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
            sapQuery = sapQuery.where('soh.warehouse_id', 'in', warehouseIds as any);
            countQuery = countQuery.where('warehouse_id', 'in', warehouseIds as any);
        }

        const saps = await sapQuery.execute();

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
    } catch (error: any) {
        console.error('Failed to fetch Out SAPs:', error);
        return { success: false, error: error.message };
    }
}

export async function getOutSapItemsByHeaderId(headerId: number | string) {
    try {
        const items = await db
            .selectFrom('inventory.sap_out_items as i')
            .innerJoin('inventory.materials as m', 'm.id', 'i.designator_id')
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
            .where('i.header_id', '=', headerId as any)
            .execute();

        return { success: true, data: items };
    } catch (error: any) {
        console.error('Failed to fetch items:', error);
        return { success: false, error: error.message };
    }
}

export async function getTechnicians(sa?: string) {
    try {
        let query = db.selectFrom('hr.technicians as t').selectAll('t');
        if (sa) {
            query = query
                .innerJoin('hr.branches as b', 'b.id', 't.branch_id')
                .where('b.service_area', '=', sa);
        }
        const technicians = await query.execute();
        return { success: true, data: technicians };
    } catch (error: any) {
        console.error('Failed to fetch technicians:', error);
        return { success: false, data: [] };
    }
}

export async function getMaterials() {
    try {
        const mats = await db.selectFrom('inventory.materials').selectAll().execute();
        return { success: true, data: mats };
    } catch (error: any) {
        console.error('Error fetching materials:', error);
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
    } catch (error: any) {
        console.error('Error fetching materials for warehouse:', error);
        return { success: false, data: [] };
    }
}

export async function getWarehouses() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        let query = db.selectFrom('inventory.mas_wh').selectAll();

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('id', 'in', warehouseIds as any);
        } else if (isStaff && warehouseIds.length === 0) {
            return { success: true, data: [] };
        }

        const whs = await query.execute();
        return { success: true, data: whs };
    } catch (error: any) {
        console.error('Error fetching warehouses:', error);
        return { success: false, data: [] };
    }
}

export async function getBranches() {
    try {
        const { branchName } = await getSessionUser();
        let query = db.selectFrom('hr.branches').selectAll();

        if (branchName) {
            query = query.where('branch', '=', branchName);
        }

        const branches = await query.execute();
        return { success: true, data: branches };
    } catch (error: any) {
        console.error('Error fetching branches:', error);
        return { success: false, data: [] };
    }
}

export async function createOutSap(payload: any) {
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
        FROM inventory.sap_out_header 
        WHERE to_char(request_time, 'YYMM') = ${yymm}
      `.execute(trx);
            const count = Number(countRes.rows[0].count);
            const sequence = count.toString().padStart(4, '0');

            const generatedIdTrx = `TRX-OUT-${intls}-${payload.nik_teknisi}-${yymm}${sequence}`;

            const createdBy = await getSessionNik();

            // Create Header
            const headerResult = await trx
                .insertInto('inventory.sap_out_header')
                .values({
                    id_trx: generatedIdTrx,
                    nik_teknisi: payload.nik_teknisi,
                    name_sa: payload.name_sa,
                    warehouse_id: payload.warehouse_id,
                    id_reservasi: payload.id_reservasi,
                    sap_number: payload.sap_number,
                    request_id: payload.request_id,
                    end_status: 'intech',
                    created_by: createdBy,
                })
                .returning('id')
                .executeTakeFirstOrThrow();

            // Create Items
            if (payload.items && payload.items.length > 0) {
                const itemsToInsert = payload.items.map((item: any) => ({
                    header_id: headerResult.id,
                    designator_id: item.designator_id,
                    qty_req: item.qty_req,
                    qty_used: 0,
                    unit_price: item.unit_price || 0,
                }));

                await trx.insertInto('inventory.sap_out_items').values(itemsToInsert).execute();
            }

            // Call SP sp_sap_out for this header to reduce stock
            await sql`CALL inventory.sp_sap_out(${headerResult.id}::bigint, ${payload.warehouse_id}::integer, 'system')`.execute(
                trx
            );

            return headerResult.id;
        });

        revalidatePath('/stock-intech');
        revalidatePath('/stock-inventory');
        revalidatePath('/apps/out-material');
        return { success: true, header_id: result };
    } catch (error: any) {
        console.error('Failed to create Out SAP:', error);
        return { success: false, error: error.message };
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
                .where('id', '=', headerId as any)
                .execute();

            // Get warehouse_id first
            const header = await trx
                .selectFrom('inventory.sap_out_header')
                .select(['warehouse_id'])
                .where('id', '=', headerId as any)
                .executeTakeFirst();

            const warehouseId = header?.warehouse_id;

            // Call SP sp_sap_out for this header to reduce stock
            await sql`CALL inventory.sp_sap_out(${headerId}::bigint, ${warehouseId}::integer, 'system')`.execute(
                trx
            );

            return true;
        });

        revalidatePath('/stock-intech');
        revalidatePath('/stock-inventory');
        revalidatePath('/apps/out-material');
        return { success: true };
    } catch (error: any) {
        console.error('Failed to update status to intech:', error);
        return { success: false, error: error.message };
    }
}
