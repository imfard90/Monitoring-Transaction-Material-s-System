'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { inventoryRepository } from '@/lib/repositories';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

const createTagSchema = z
    .object({
        fromWhId: z.number().int().positive(),
        toWhId: z.number().int().positive(),
        requestId: z.string().optional().nullable(),
        vendorName: z.string().optional().nullable(),
        cost: z.number().nonnegative(),
        items: z
            .array(
                z.object({
                    designator_id: z.number().int().positive(),
                    qty: z.number().positive(),
                })
            )
            .min(1),
        idemKey: z.string().min(1),
    })
    .refine((data) => data.fromWhId !== data.toWhId, {
        message: 'From WH and To WH cannot be the same',
        path: ['toWhId'],
    });

const updateTagSchema = z
    .object({
        headerId: z.number().int().positive(),
        actionType: z.enum(['request', 'send', 'accept']),
        actionId: z.string().min(1),
        items: z
            .array(
                z.object({
                    designator_id: z.number().int().positive(),
                    qty: z.number().nonnegative(),
                })
            )
            .min(1),
        idemKey: z.string().min(1),
    })
    .superRefine((data, context) => {
        data.items.forEach((item, index) => {
            if (data.actionType !== 'accept' && item.qty === 0) {
                context.addIssue({
                    code: 'custom',
                    message: 'Qty harus lebih dari 0 untuk request/send',
                    path: ['items', index, 'qty'],
                });
            }
        });

        if (data.actionType === 'accept' && !data.items.some((item) => item.qty > 0)) {
            context.addIssue({
                code: 'custom',
                message: 'Minimal 1 item harus memiliki qty > 0',
                path: ['items'],
            });
        }
    });

const acceptReturnTagSchema = z.object({
    headerId: z.number().int().positive(),
    acceptId: z.string().min(1),
    idemKey: z.string().min(1),
});

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

    const parsed = createTagSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: `Invalid input data: ${parsed.error.issues[0].message}` };
    }

    try {
        const { isDuplicate, result } = await checkAndStoreIdempotency(
            payload.idemKey,
            payload,
            async (data) => {
                const res = await inventoryRepository.createInOutTag({
                    fromWhId: data.fromWhId ?? null,
                    toWhId: data.toWhId ?? null,
                    requestId: data.requestId || null,
                    vendorName: data.vendorName || null,
                    cost: data.cost,
                    items: data.items,
                });

                return res;
            }
        );

        if (isDuplicate)
            return { success: false, error: 'Transaksi ganda terdeteksi. Silakan tunggu.' };

        return { success: true, id_trx: result };
    } catch (error: unknown) {
        actionLogger.error(
            'Error creating tag:',
            error instanceof Error ? error : new Error(String(error))
        );

        if (
            error instanceof Error &&
            'code' in error &&
            (error as { code: string }).code === '23505'
        ) {
            return {
                success: false,
                error: 'ID (Request/Send/Accept) sudah pernah digunakan di transaksi lain.',
            };
        }

        return { success: false, error: 'Failed to create tag.' };
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

    const parsed = updateTagSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: `Invalid input data: ${parsed.error.issues[0].message}` };
    }

    try {
        // ── Authorization: enforce PIC-based access per actionType ──────────
        // - request : only non-Staff (Admin/Supervisor/etc.)
        // - send    : only non-Staff OR PIC of the sending warehouse (from_wh_id)
        // - accept  : only non-Staff OR PIC of the receiving warehouse (to_wh_id)
        const { isStaff, nik, warehouseIds } = await getSessionUser();

        if (isStaff) {
            if (payload.actionType === 'request') {
                return {
                    success: false,
                    error: 'Akses ditolak: Staff tidak dapat melakukan Request ID.',
                };
            }

            // Resolve from/to wh + PICs for this header
            const header = await db
                .selectFrom('inventory.inout_tag_header as h')
                .leftJoin('inventory.mas_wh as wh_from', 'wh_from.id', 'h.from_wh_id')
                .leftJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'h.to_wh_id')
                .select([
                    'h.from_wh_id',
                    'h.to_wh_id',
                    'wh_from.pic_1 as from_pic_1',
                    'wh_from.pic_2 as from_pic_2',
                    'wh_to.pic_1 as to_pic_1',
                    'wh_to.pic_2 as to_pic_2',
                ])
                .where('h.id', '=', String(payload.headerId))
                .executeTakeFirst();

            if (!header) {
                return { success: false, error: 'Transaksi tidak ditemukan.' };
            }

            const isSenderPic =
                nik === header.from_pic_1 ||
                nik === header.from_pic_2 ||
                (header.from_wh_id !== null && warehouseIds.includes(Number(header.from_wh_id)));

            const isReceiverPic =
                nik === header.to_pic_1 ||
                nik === header.to_pic_2 ||
                (header.to_wh_id !== null && warehouseIds.includes(Number(header.to_wh_id)));

            if (payload.actionType === 'send' && !isSenderPic) {
                return {
                    success: false,
                    error: 'Akses ditolak: hanya PIC gudang pengirim yang dapat mengisi Send ID.',
                };
            }

            if (payload.actionType === 'accept' && !isReceiverPic) {
                return {
                    success: false,
                    error: 'Akses ditolak: hanya PIC gudang penerima yang dapat mengisi Accept ID.',
                };
            }
        }
        // Non-Staff (Admin, etc.) may perform any actionType without restriction.

        const { isDuplicate } = await checkAndStoreIdempotency(
            payload.idemKey,
            payload,
            async (data) => {
                await inventoryRepository.updateInOutTag({
                    headerId: Number(data.headerId),
                    actionType: data.actionType,
                    actionId: data.actionId,
                    items: data.items,
                });

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
        actionLogger.error(
            'Failed to update tag:',
            error instanceof Error ? error : new Error(String(error))
        );

        if (
            error instanceof Error &&
            'code' in error &&
            (error as { code: string }).code === '23505'
        ) {
            return {
                success: false,
                error: 'ID (Request/Send/Accept) sudah pernah digunakan di transaksi lain. Harap gunakan ID yang unik.',
            };
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update tag.',
        };
    }
}

export async function cancelTag(headerId: number, type?: string) {
    try {
        const { isStaff, warehouseIds, nik } = await getSessionUser();

        if (isStaff) {
            if (type === 'return') {
                const ret = await db
                    .selectFrom('inventory.return_material_header')
                    .select('warehouse_id')
                    .where('id', '=', String(headerId))
                    .executeTakeFirst();

                if (!ret?.warehouse_id || !warehouseIds.includes(Number(ret.warehouse_id))) {
                    return {
                        success: false,
                        error: 'Akses ditolak: Anda tidak memiliki akses membatalkan transaksi ini.',
                    };
                }
            } else {
                const header = await db
                    .selectFrom('inventory.inout_tag_header as h')
                    .leftJoin('inventory.mas_wh as wh_from', 'wh_from.id', 'h.from_wh_id')
                    .leftJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'h.to_wh_id')
                    .select([
                        'h.from_wh_id',
                        'h.to_wh_id',
                        'wh_from.pic_1 as from_pic_1',
                        'wh_from.pic_2 as from_pic_2',
                        'wh_to.pic_1 as to_pic_1',
                        'wh_to.pic_2 as to_pic_2',
                    ])
                    .where('h.id', '=', String(headerId))
                    .executeTakeFirst();

                if (!header) {
                    return { success: false, error: 'Transaksi tidak ditemukan.' };
                }

                const hasAccess =
                    nik === header.from_pic_1 ||
                    nik === header.from_pic_2 ||
                    nik === header.to_pic_1 ||
                    nik === header.to_pic_2 ||
                    (header.from_wh_id !== null &&
                        warehouseIds.includes(Number(header.from_wh_id))) ||
                    (header.to_wh_id !== null && warehouseIds.includes(Number(header.to_wh_id)));

                if (!hasAccess) {
                    return {
                        success: false,
                        error: 'Akses ditolak: Anda tidak memiliki akses membatalkan transaksi ini.',
                    };
                }
            }
        }

        if (type === 'return') {
            await db
                .updateTable('inventory.return_material_header')
                .set({ end_status: 'cancel' })
                .where('id', '=', String(headerId))
                .where('end_status', '!=', 'closed')
                .where('end_status', '!=', 'cancel')
                .execute();
        } else {
            await db
                .updateTable('inventory.inout_tag_header')
                .set({ end_status: 'cancel' })
                .where('id', '=', String(headerId))
                .where('end_status', '!=', 'closed')
                .where('end_status', '!=', 'cancel')
                .execute();
        }

        revalidatePath('/apps/inout-tag');
        revalidatePath('/stock-inventory');
        revalidatePath('/stock-intech');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to cancel tag:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Failed to cancel tag.' };
    }
}

export async function acceptReturnTag(headerId: number, acceptId: string, idemKey: string) {
    if (!idemKey) return { success: false, error: 'Security constraint: Idempotency key required' };

    const parsed = acceptReturnTagSchema.safeParse({ headerId, acceptId, idemKey });
    if (!parsed.success) {
        return { success: false, error: `Invalid input data: ${parsed.error.issues[0].message}` };
    }

    try {
        const { isStaff, warehouseIds } = await getSessionUser();
        if (isStaff) {
            const ret = await db
                .selectFrom('inventory.return_material_header')
                .select('warehouse_id')
                .where('id', '=', String(headerId))
                .executeTakeFirst();

            if (!ret) {
                return { success: false, error: 'Transaksi tidak ditemukan.' };
            }

            if (!ret.warehouse_id || !warehouseIds.includes(Number(ret.warehouse_id))) {
                return {
                    success: false,
                    error: 'Akses ditolak: hanya PIC gudang tujuan return yang dapat menerima transaksi ini.',
                };
            }
        }

        const { isDuplicate } = await checkAndStoreIdempotency(
            idemKey,
            { headerId, acceptId },
            async (data) => {
                await inventoryRepository.recordReturnMaterial({
                    headerId: Number(data.headerId),
                    acceptId: data.acceptId,
                });
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
        actionLogger.error(
            'Failed to accept return material:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to accept return material.',
        };
    }
}
