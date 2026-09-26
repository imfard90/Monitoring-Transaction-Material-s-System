'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

export async function getInOutTags(offsetMonths = 0, limitMonths = 5) {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        const applyWhFilter = isStaff && warehouseIds.length > 0;

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() - offsetMonths);

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - (offsetMonths + limitMonths));

        let inoutQuery = db
            .selectFrom('inventory.inout_tag_header as h')
            .leftJoin('inventory.vendor_tracking as v', 'v.header_id', 'h.id')
            .leftJoin('inventory.mas_wh as wh_from', 'wh_from.id', 'h.from_wh_id')
            .leftJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'h.to_wh_id')
            .selectAll('h')
            .select(['v.name_vendor', 'wh_from.name as from_wh_name', 'wh_to.name as to_wh_name'])
            .where('h.request_time', '<=', endDate)
            .where('h.request_time', '>', startDate);

        if (applyWhFilter) {
            inoutQuery = inoutQuery.where((eb) =>
                eb.or([
                    eb('h.from_wh_id', 'in', warehouseIds),
                    eb('h.to_wh_id', 'in', warehouseIds),
                ])
            );
        }

        const inoutHeaders = await inoutQuery.execute();

        let returnQuery = db
            .selectFrom('inventory.return_material_header as r')
            .innerJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'r.warehouse_id')
            .innerJoin('hr.technicians as t', 't.nik', 'r.nik_teknisi')
            .select([
                'r.id',
                'r.id_trx',
                'r.accept_id',
                'r.end_status',
                'r.created_at as request_time',
                't.name as from_wh_name',
                'wh_to.name as to_wh_name',
            ])
            .where('r.created_at', '<=', endDate)
            .where('r.created_at', '>', startDate);

        if (applyWhFilter) {
            returnQuery = returnQuery.where('r.warehouse_id', 'in', warehouseIds as any);
        }

        const returnHeaders = await returnQuery.execute();

        // Merge and format
        const allTags = [
            ...inoutHeaders.map((h) => ({ ...h, type: 'inout' })),
            ...returnHeaders.map((r) => ({
                id: r.id,
                id_trx: r.id_trx,
                request_id: null,
                send_id: null,
                accept_id: r.accept_id,
                end_status:
                    r.end_status === 'pending'
                        ? 'requested'
                        : r.end_status === 'accepted'
                          ? 'closed'
                          : r.end_status,
                request_time: r.request_time,
                name_vendor: null,
                from_wh_name: `Technician: ${r.from_wh_name}`,
                to_wh_name: r.to_wh_name,
                type: 'return',
            })),
        ];

        // Sort by time desc
        allTags.sort((a, b) => {
            const timeA = a.request_time ? new Date(a.request_time).getTime() : 0;
            const timeB = b.request_time ? new Date(b.request_time).getTime() : 0;
            return timeB - timeA;
        });

        // Group by status for the cards
        const counts = {
            requested: 0,
            in_transit: 0,
            closed: 0,
            cancel: 0,
        };

        allTags.forEach((h) => {
            if (h.end_status === 'requested') counts.requested++;
            else if (h.end_status === 'in_transit') counts.in_transit++;
            else if (h.end_status === 'closed') counts.closed++;
            else if (h.end_status === 'cancel') counts.cancel++;
        });

        return { success: true, data: allTags, counts };
    } catch (error) {
        console.error('Error fetching tags:', error);
        return {
            success: false,
            data: [],
            counts: { requested: 0, in_transit: 0, closed: 0, cancel: 0 },
        };
    }
}

export async function getInOutTagItems(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.inout_tag_items as i')
            .leftJoin('inventory.materials as m', 'm.id', 'i.designator_id')
            .select([
                'i.id',
                'i.action',
                'i.qty',
                'm.code as designator_code',
                'm.description as material_description',
            ])
            .where('i.header_id', '=', String(headerId) as any)
            .execute();

        return { success: true, data: items };
    } catch (error) {
        console.error('Error fetching tag items:', error);
        return { success: false, data: [] };
    }
}

export async function getWarehouses() {
    try {
        const whs = await db.selectFrom('inventory.mas_wh').selectAll().execute();
        return { success: true, data: whs };
    } catch (error) {
        console.error('Error fetching warehouses:', error);
        return { success: false, data: [] };
    }
}

export async function getMaterials() {
    try {
        const mats = await db.selectFrom('inventory.materials').selectAll().execute();
        return { success: true, data: mats };
    } catch (error) {
        console.error('Error fetching materials:', error);
        return { success: false, data: [] };
    }
}

export async function getMaterialsWithStock(fromWhId?: number | null) {
    try {
        // If no WH selected, or vendor, return all materials with stock ~
        let checkStock = false;

        if (fromWhId) {
            const wh = await db
                .selectFrom('inventory.mas_wh')
                .select('check_stock')
                .where('id', '=', Number(fromWhId))
                .executeTakeFirst();
            if (wh?.check_stock) {
                checkStock = true;
            }
        }

        if (checkStock) {
            // Check stock
            const mats = await db
                .selectFrom('inventory.materials as m')
                .innerJoin('inventory.stock_balance as sb', 'sb.designator_id', 'm.id')
                .selectAll('m')
                .select('sb.qty_stock')
                .where('sb.warehouse_id', '=', Number(fromWhId))
                .where('sb.qty_stock', '>', 0)
                .execute();

            return { success: true, data: mats };
        } else {
            const mats = await db.selectFrom('inventory.materials').selectAll().execute();
            const data = mats.map((m) => ({ ...m, qty_stock: '~' }));
            return { success: true, data };
        }
    } catch (error) {
        console.error('Error fetching materials with stock:', error);
        return { success: false, data: [] };
    }
}

import { sql } from 'kysely';

export async function createTag(payload: {
    fromWhId: number;
    toWhId: number;
    requestId: string;
    vendorName: string;
    cost: number;
    items: Array<{ designator_id: number; qty: number }>;
    idemKey: string;
}) {
    if (!payload.idemKey)
        return { success: false, error: 'Security constraint: Idempotency key required' };

    try {
        const { isDuplicate, result } = await checkAndStoreIdempotency(
            payload.idemKey,
            payload,
            async (data) => {
                const itemsJson = JSON.stringify(data.items);

                const res = await sql<{ p_id_trx: string }>`
                  CALL inventory.sp_create_inout_tag(
                    ${data.fromWhId}::bigint, 
                    ${data.toWhId}::bigint, 
                    ${data.requestId || null}, 
                    ${data.vendorName || null}, 
                    ${data.cost}, 
                    ${itemsJson}::jsonb, 
                    null
                  )
                `.execute(db);

                return res.rows[0]?.p_id_trx;
            }
        );

        if (isDuplicate)
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };

        return { success: true, id_trx: result };
    } catch (error: unknown) {
        console.error('Error creating tag:', error);

        if ((error as any).code === '23505') {
            return {
                success: false,
                error: 'ID (Request/Send/Accept) sudah pernah digunakan di transaksi lain.',
            };
        }

        return { success: false, error: 'Failed to create tag.' };
    }
}

export async function getInoutTagItemsByHeaderId(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.inout_tag_items as items')
            .innerJoin('inventory.materials as mat', 'items.designator_id', 'mat.id')
            .select([
                'items.id',
                'items.header_id',
                'items.action',
                'items.action_id',
                'items.designator_id',
                'items.qty',
                'mat.code',
                'mat.description',
                'mat.unit',
            ])
            .where('items.header_id', '=', String(headerId) as any)
            .execute();

        return { success: true, data: items };
    } catch (error: unknown) {
        console.error('Failed to fetch tag items:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function updateTag(payload: {
    headerId: number;
    actionType: 'request' | 'send' | 'accept';
    actionId: string;
    items: { designator_id: number; qty: number }[];
    idemKey: string;
}) {
    if (!payload.idemKey)
        return { success: false, error: 'Security constraint: Idempotency key required' };

    try {
        const { isDuplicate } = await checkAndStoreIdempotency(
            payload.idemKey,
            payload,
            async (data) => {
                const itemsJson = JSON.stringify(data.items);

                await sql`
                  CALL inventory.sp_update_inout_tag(
                    ${Number(data.headerId)},
                    ${data.actionType},
                    ${data.actionId},
                    ${itemsJson}::jsonb
                  )
                `.execute(db);

                return true;
            }
        );

        if (isDuplicate)
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };

        revalidatePath('/apps/inout-tag');
        revalidatePath('/stock-inventory');
        revalidatePath('/stock-intech');
        return { success: true };
    } catch (error: unknown) {
        console.error('Failed to update tag:', error);

        if ((error as any).code === '23505') {
            return {
                success: false,
                error: 'ID (Request/Send/Accept) sudah pernah digunakan di transaksi lain. Harap gunakan ID yang unik.',
            };
        }

        return { success: false, error: (error as any).message || 'Failed to update tag.' };
    }
}

export async function cancelTag(headerId: number) {
    try {
        await db
            .updateTable('inventory.inout_tag_header')
            .set({ end_status: 'cancel' })
            .where('id', '=', headerId as any)
            .where('end_status', '!=', 'closed')
            .where('end_status', '!=', 'cancel')
            .execute();

        revalidatePath('/apps/inout-tag');
        revalidatePath('/stock-inventory');
        revalidatePath('/stock-intech');
        return { success: true };
    } catch (error: unknown) {
        console.error('Failed to cancel tag:', error);
        return { success: false, error: 'Failed to cancel tag.' };
    }
}

export async function acceptReturnTag(headerId: number, acceptId: string, idemKey: string) {
    if (!idemKey) return { success: false, error: 'Security constraint: Idempotency key required' };

    try {
        const { isDuplicate } = await checkAndStoreIdempotency(
            idemKey,
            { headerId, acceptId },
            async (data) => {
                await sql`
                    CALL inventory.sp_return_material(
                        ${data.headerId}::bigint,
                        ${data.acceptId}
                    )
                `.execute(db);
                return true;
            }
        );

        if (isDuplicate)
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };

        revalidatePath('/apps/inout-tag');
        revalidatePath('/stock-inventory');
        revalidatePath('/stock-intech');
        return { success: true };
    } catch (error: unknown) {
        console.error('Failed to accept return material:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to accept return material.',
        };
    }
}

export async function getReturnMaterialItemsByHeaderId(headerId: number) {
    try {
        const items = await db
            .selectFrom('inventory.return_material_items as ri')
            .innerJoin('inventory.materials as m', 'm.id', 'ri.designator_id')
            .select(['ri.id', 'ri.designator_id', 'ri.qty', 'm.code', 'm.description', 'm.unit'])
            .where('ri.header_id', '=', headerId as any)
            .execute();

        return { success: true, data: items };
    } catch (error: unknown) {
        console.error('Failed to fetch return material items:', error);
        return {
            success: false,
            data: [],
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
