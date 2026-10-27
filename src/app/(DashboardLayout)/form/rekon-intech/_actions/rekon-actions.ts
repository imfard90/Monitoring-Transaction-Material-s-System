'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionNik, getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createInventoryRepository } from '@/lib/repositories';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

const rekonItemSchema = z.object({
    sap_out_id: z.string().trim().min(1),
    id_trx: z.string().trim().min(1),
    sap_number: z.string().trim().nullable(),
    name_sa: z.string().trim().min(1),
    name_wh: z.string().trim().nullable(),
    designator_id: z.number().int().positive(),
    sap_out_item_id: z.string().trim().min(1),
    qty: z.number().positive(),
    wo_type: z.string().trim().min(1),
    wo_number: z.string().trim().min(1).max(50, 'Nomor WO maksimal 50 karakter'),
    notes: z.string().trim(),
});

const submitRekonIntechSchema = z.object({
    nik: z.string().trim().min(1),
    items: z.array(rekonItemSchema).min(1),
    idemKey: z.string().trim().min(1),
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

        if (isStaff) {
            if (warehouseIds.length === 0) {
                return { success: true, data: [] };
            }
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
        const { isStaff, warehouseIds } = await getSessionUser();

        let query = db
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
            .orderBy('soh.id_trx', 'asc');

        if (isStaff) {
            if (warehouseIds.length === 0) {
                return { success: true, data: [] };
            }
            query = query.where('soh.warehouse_id', 'in', warehouseIds);
        }

        const materials = await query.execute();

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
    wo_type: string;
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
        const { isStaff, warehouseIds } = await getSessionUser();
        if (isStaff) {
            if (warehouseIds.length === 0) {
                return {
                    success: false,
                    error: 'Akses ditolak: Anda tidak memiliki akses ke gudang manapun',
                };
            }
            const sapOutIds = Array.from(
                new Set(parsed.data.items.map((item) => String(item.sap_out_id)))
            );
            const allowedHeaders = await db
                .selectFrom('inventory.sap_out_header')
                .select('id')
                .where('id', 'in', sapOutIds)
                .where('warehouse_id', 'in', warehouseIds)
                .execute();
            if (allowedHeaders.length !== sapOutIds.length) {
                return {
                    success: false,
                    error: 'Akses ditolak: Sebagian transaksi bukan dari gudang wewenang Anda',
                };
            }
        }

        const { isDuplicate, result: _result } = await checkAndStoreIdempotency(
            idemKey,
            { nik, items },
            async (data) => {
                // Validate that none of the WOs are managed by Rekon Lensa
                const woNumbers = Array.from(
                    new Set(data.items.map((item) => item.wo_number.trim()))
                ).filter(Boolean);

                if (woNumbers.length > 0) {
                    const lensaWos = await db
                        .selectFrom('inventory.wo_lensa_header')
                        .select(['wo_number', 'rekon_check'])
                        .where('wo_number', 'in', woNumbers)
                        .execute();

                    if (lensaWos.length > 0) {
                        const alreadyReconciled = lensaWos.find((w) => w.rekon_check === true);
                        if (alreadyReconciled) {
                            throw new Error(
                                `WO ${alreadyReconciled.wo_number} sudah direkon melalui Rekon Lensa.`
                            );
                        }
                        throw new Error(
                            `WO ${lensaWos[0].wo_number} terdaftar di WO Lensa Ref. Silakan gunakan Rekon Lensa.`
                        );
                    }
                }

                // Validate WO number uniqueness in transaction_used_header
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
                    const cleanWoNumber = item.wo_number.trim();
                    const cleanSapOutId = item.sap_out_id.trim();
                    const cleanWoType = item.wo_type.trim();
                    const key = `${cleanSapOutId}_${cleanWoNumber}_${cleanWoType}`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(item);
                }

                const createdBy = await getSessionNik();

                await db.transaction().execute(async (trx) => {
                    const now = new Date();
                    const yymm = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;

                    for (const key in groups) {
                        const groupItems = groups[key];
                        const first = groupItems[0];

                        const repo = createInventoryRepository(trx);
                        const sequence = await repo.generateTrxUsedSeq();
                        const cleanNik = data.nik.trim();
                        const cleanSapNumber = (first.sap_number ?? '').trim();
                        const cleanWo = first.wo_number.trim();
                        const generatedIdTrx = `TRX-USED-${cleanNik}-${cleanSapNumber}-${cleanWo}-${yymm}${sequence}`;
                        const normalizedWoType = first.wo_type
                            ? first.wo_type.trim().toLowerCase().replace(/\s+/g, '_')
                            : null;
                        await repo.submitRekonIntech({
                            idTrx: generatedIdTrx,
                            nik: cleanNik,
                            sapOutId: String(first.sap_out_id).trim(),
                            woNumber: cleanWo,
                            woType: normalizedWoType,
                            nameSa: first.name_sa,
                            nameWh: first.name_wh || '',
                            createdBy,
                            items: groupItems.map((item) => ({
                                designator_id: item.designator_id,
                                sap_out_item_id: Number(item.sap_out_item_id),
                                qty: item.qty,
                                notes: item.notes || null,
                            })),
                        });
                    }
                });

                return true;
            }
        );

        if (isDuplicate) {
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };
        }

        revalidatePath('/form/rekon-intech');
        revalidatePath('/apps/hasil-rekon');
        revalidatePath('/apps/out-material');
        revalidatePath('/stock-intech');
        revalidatePath('/form/rekon-lensa');
        revalidatePath('/');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to submit Rekon Intech:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
