'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

const rekonItemSchema = z.object({
    sap_out_id: z.string().min(1),
    id_trx: z.string().min(1),
    sap_number: z.string().nullable(),
    name_sa: z.string().min(1),
    name_wh: z.string().nullable(),
    designator_id: z.number().int().positive(),
    sap_out_item_id: z.string().min(1),
    qty: z.number().positive(),
    wo_type: z.any(),
    wo_number: z.string().min(1),
    notes: z.string(),
});

const submitRekonIntechSchema = z.object({
    nik: z.string().min(1),
    items: z.array(rekonItemSchema).min(1),
    idemKey: z.string().min(1),
});

export async function getTechniciansWithIntechSaps() {
    try {
        const { isStaff, warehouseIds } = await getSessionUser();

        let query = db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('hr.technicians as t', 't.nik', 'soh.nik_teknisi')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .select(['t.nik', 't.name as nama_teknisi'])
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0)
            .groupBy(['t.nik', 't.name'])
            .orderBy('t.name', 'asc');

        if (isStaff && warehouseIds.length > 0) {
            query = query.where('soh.warehouse_id', 'in', warehouseIds);
        }

        const saps = await query.execute();

        return { success: true, data: saps };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch technicians:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getTechnicianMaterials(nik: string) {
    try {
        const materials = await db
            .selectFrom('inventory.sap_out_header as soh')
            .innerJoin('inventory.sap_out_items as soi', 'soi.header_id', 'soh.id')
            .innerJoin('inventory.materials as m', 'm.id', 'soi.designator_id')
            .leftJoin('inventory.mas_wh as wh', 'wh.id', 'soh.warehouse_id')
            .select([
                'soh.id as sap_out_id',
                'soh.id_trx',
                'soh.sap_number',
                'soh.request_time',
                'soh.name_sa',
                'wh.name as name_wh',
                'm.code as material_code',
                'm.description',
                'm.id as designator_id',
                'soi.id as sap_out_item_id',
                'soi.qty_req',
                'soi.qty_used',
            ])
            .where('soh.nik_teknisi', '=', nik)
            .where('soh.end_status', '=', 'intech')
            .where(sql`soi.qty_req - COALESCE(soi.qty_used, 0)`, '>', 0)
            .orderBy('soh.id_trx', 'asc')
            .execute();

        return { success: true, data: materials };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch technician materials:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export type RekonItemPayload = {
    sap_out_id: string;
    id_trx: string;
    sap_number: string | null;
    name_sa: string;
    name_wh: string | null;
    designator_id: number;
    sap_out_item_id: string;
    qty: number;
    wo_type: any;
    wo_number: string;
    notes: string;
};

export async function submitRekonIntech(nik: string, items: RekonItemPayload[], idemKey: string) {
    if (!idemKey) return { success: false, error: 'Security constraint: Idempotency key required' };

    const parsed = submitRekonIntechSchema.safeParse({ nik, items, idemKey });
    if (!parsed.success) {
        return { success: false, error: `Invalid input data: ${parsed.error.issues[0].message}` };
    }

    try {
        const { isDuplicate, result: _result } = await checkAndStoreIdempotency(
            idemKey,
            { nik, items },
            async (data) => {
                // Prevent a WO already managed by Rekon Lensa from being reconciled via Intech.
                const woNumber = data.items[0].wo_number;
                const lensaWo = await db
                    .selectFrom('inventory.wo_lensa_header')
                    .select('rekon_check')
                    .where('wo_number', 'like', `%${woNumber}%`)
                    .executeTakeFirst();

                if (lensaWo) {
                    if (lensaWo.rekon_check === true) {
                        throw new Error(`WO ${woNumber} sudah direkon melalui Rekon Lensa.`);
                    }
                    throw new Error(
                        `WO ${woNumber} terdaftar di WO Lensa Ref. Silakan gunakan Rekon Lensa.`
                    );
                }

                // Validate WO number uniqueness
                const woNumbers = Array.from(new Set(data.items.map((item) => item.wo_number)));
                if (woNumbers.length > 0) {
                    const existingWos = await db
                        .selectFrom('inventory.transaction_used_header')
                        .select('wo_number')
                        .where('wo_number', 'in', woNumbers)
                        .execute();

                    if (existingWos.length > 0) {
                        const duplicateWos = existingWos.map((w) => w.wo_number).join(', ');
                        throw new Error(
                            `WO Number berikut sudah pernah digunakan: ${duplicateWos}`
                        );
                    }
                }

                // Group items by sap_out_id, wo_number, wo_type
                const groups: { [key: string]: RekonItemPayload[] } = {};
                for (const item of data.items) {
                    const key = `${item.sap_out_id}_${item.wo_number}_${item.wo_type}`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(item);
                }

                const createdBy = await getSessionNik();

                await db.transaction().execute(async (trx) => {
                    const now = new Date();
                    const yymm = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;

                    // Get initial count for sequence
                    const countRes = await sql<{ count: string | number }>`
                        SELECT COUNT(*) as count 
                        FROM inventory.transaction_used_header 
                        WHERE to_char(created_at, 'YYMM') = ${yymm}
                    `.execute(trx);
                    let count = Number(countRes.rows[0].count);

                    for (const key in groups) {
                        const groupItems = groups[key];
                        const first = groupItems[0];

                        count++;
                        const sequence = count.toString().padStart(4, '0');
                        const generatedIdTrx = `TRX-USED-${data.nik}-${first.sap_number}-${first.wo_number}-${yymm}${sequence}`;

                        // Insert Header
                        const headerResult = await trx
                            .insertInto('inventory.transaction_used_header')
                            .values({
                                id_trx: generatedIdTrx,
                                sap_out_id: first.sap_out_id,
                                nik_teknisi: data.nik,
                                name_sa: first.name_sa,
                                name_wh: first.name_wh || '',
                                wo_number: first.wo_number,
                                wo_type: first.wo_type,
                                created_by: createdBy,
                            })
                            .returning('id')
                            .executeTakeFirstOrThrow();

                        const headerId = headerResult.id;

                        // Insert Items, Update sap_out_items, and call SP
                        for (const item of groupItems) {
                            await trx
                                .insertInto('inventory.transaction_used_item')
                                .values({
                                    used_id: headerId,
                                    designator_id: item.designator_id,
                                    qty: item.qty,
                                    notes: item.notes || null,
                                })
                                .execute();

                            await trx
                                .updateTable('inventory.sap_out_items')
                                .set((_eb) => ({
                                    qty_used: sql`COALESCE(qty_used, 0) + ${item.qty}`,
                                }))
                                .where('id', '=', item.sap_out_item_id)
                                .execute();

                            // Fetch warehouse_id from sap_out_header
                            const sap = await trx
                                .selectFrom('inventory.sap_out_header')
                                .select('warehouse_id')
                                .where('id', '=', item.sap_out_id)
                                .executeTakeFirst();
                            const warehouseId = sap?.warehouse_id || 0;

                            await sql`CALL inventory.sp_record_material_used(${warehouseId}, ${item.designator_id}, ${item.qty}, ${generatedIdTrx}, ${item.notes || null}, ${createdBy})`.execute(
                                trx
                            );
                        }

                        // Check if sap_out_header can be closed
                        const checkRes = await sql<{ all_closed: boolean }>`
                            SELECT bool_and(qty_req = COALESCE(qty_used, 0)) as all_closed
                            FROM inventory.sap_out_items
                            WHERE header_id = ${first.sap_out_id}
                        `.execute(trx);

                        if (checkRes.rows[0]?.all_closed) {
                            await trx
                                .updateTable('inventory.sap_out_header')
                                .set({ end_status: 'close' })
                                .where('id', '=', String(first.sap_out_id))
                                .execute();
                        }
                    }
                });

                return true;
            }
        );

        if (isDuplicate) {
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };
        }

        revalidatePath('/apps/rekon-intech');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to submit Rekon Intech:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
