'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
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

const updateTagSchema = z.object({
    headerId: z.number().int().positive(),
    actionType: z.enum(['request', 'send', 'accept']),
    actionId: z.string().min(1),
    items: z
        .array(
            z.object({
                designator_id: z.number().int().positive(),
                qty: z.number().positive(),
            })
        )
        .min(1),
    idemKey: z.string().min(1),
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
        const { isStaff, nik } = await getSessionUser();

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
                .innerJoin('inventory.mas_wh as wh_from', 'wh_from.id', 'h.from_wh_id')
                .innerJoin('inventory.mas_wh as wh_to', 'wh_to.id', 'h.to_wh_id')
                .select([
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

            const isSenderPic = nik === header.from_pic_1 || nik === header.from_pic_2;
            const isReceiverPic = nik === header.to_pic_1 || nik === header.to_pic_2;

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


