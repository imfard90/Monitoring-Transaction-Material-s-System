'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { canAccessWarehouse } from '@/lib/policies';
import { createNteRepository } from '@/lib/repositories/nte.repository';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

/** Zod schema: snList accepts both flat string[] and object[] format */
const createTagSchema = z.object({
    asal: z.string().min(1),
    tujuan: z.string().min(1),
    idemKey: z.string().uuid(),
    snList: z
        .array(
            z.union([
                z.string(),
                z.object({
                    serial_number: z.string().min(1),
                    item_description: z.string().min(1),
                }),
            ])
        )
        .min(1),
});

export async function createTagNte(payload: unknown) {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');

    const parsed = createTagSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: `Input tidak valid: ${parsed.error.issues[0].message}` };
    }
    const data = parsed.data;

    const repo = createNteRepository(db);
    const source = await repo.getAddressWarehouseMapping(data.asal);
    if (!source.rows[0]) {
        return { success: false, error: 'Alamat asal tidak ditemukan.' };
    }
    if (!canAccessWarehouse(user, source.rows[0].mapping_mas_wh)) {
        return { success: false, error: 'Alamat asal berada di luar cakupan gudang Anda.' };
    }

    try {
        const { isDuplicate } = await checkAndStoreIdempotency(
            data.idemKey,
            { asal: data.asal, tujuan: data.tujuan, snList: data.snList },
            async () => {
                // Type narrowing: check if all elements are strings or all are objects
                const isStringArray = data.snList.every(
                    (item): item is string => typeof item === 'string'
                );
                const snPayload: string[] | { serial_number: string; item_description: string }[] =
                    isStringArray
                        ? (data.snList as string[])
                        : (data.snList as { serial_number: string; item_description: string }[]);

                await repo.createTagNte({
                    asal: data.asal,
                    tujuan: data.tujuan,
                    snList: snPayload,
                    createdBy: user.nik,
                });
            }
        );

        if (isDuplicate) {
            return { success: true, duplicate: true };
        }

        revalidatePath('/apps/nte-transaction/tag');
        revalidatePath('/form/set-install-nte');
        revalidatePath('/form/return-nte');

        return { success: true };
    } catch (error) {
        actionLogger.error(
            'createTagNte error',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal membuat tag NTE.',
        };
    }
}

export async function getNteAddresses() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');
    try {
        const repo = createNteRepository(db);
        const results = await repo.listAddresses();
        return { success: true, data: results.rows ?? [] };
    } catch (error) {
        actionLogger.error(
            'getNteAddresses error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil daftar address.' };
    }
}

export async function getNteItems() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');
    try {
        const repo = createNteRepository(db);
        const results = await repo.listItems();
        return { success: true, data: results.rows ?? [] };
    } catch (error) {
        actionLogger.error(
            'getNteItems error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil daftar item.' };
    }
}

export async function getNteTechnicians() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');
    try {
        const repo = createNteRepository(db);
        const results = await repo.listTechnicians();
        return { success: true, data: results.rows ?? [] };
    } catch (error) {
        actionLogger.error(
            'getNteTechnicians error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil daftar teknisi.' };
    }
}
