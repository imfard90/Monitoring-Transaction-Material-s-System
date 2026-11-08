'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createNteRepository } from '@/lib/repositories/nte.repository';
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';

const identifierSchema = z.string().trim().min(1).max(160);

const returnNteSchema = z.object({
    idemKey: identifierSchema,
    nikTeknisi: z.string().min(1).max(160),
    tujuan: identifierSchema,
    snList: z.array(
        z.object({
            serial_number: identifierSchema,
        })
    ),
});

export async function returnNte(payload: unknown) {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');

    const parsed = returnNteSchema.safeParse(payload);
    if (!parsed.success) {
        return { success: false, error: `Input tidak valid: ${parsed.error.issues[0].message}` };
    }

    const data = parsed.data;

    try {
        const { isDuplicate } = await checkAndStoreIdempotency(data.idemKey, data, async () => {
            const repo = createNteRepository(db);
            await repo.returnNte({
                nikTeknisi: data.nikTeknisi,
                tujuan: data.tujuan,
                snList: data.snList.map((s) => s.serial_number),
                createdBy: user.nik,
            });
        });

        if (isDuplicate) {
            return { success: false, error: 'Transaksi duplikat. Silakan refresh halaman.' };
        }

        revalidatePath('/apps/nte-transaction/tag');
        revalidatePath('/form/set-install-nte');
        revalidatePath('/form/return-nte');
        return { success: true };
    } catch (error) {
        actionLogger.error(
            'returnNte error',
            error instanceof Error ? error : new Error(String(error))
        );
        const message = error instanceof Error ? error.message : 'Gagal memproses return NTE.';
        return { success: false, error: message };
    }
}
