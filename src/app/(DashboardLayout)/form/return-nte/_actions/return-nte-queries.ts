'use server';

import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { createNteRepository } from '@/lib/repositories/nte.repository';

const identifierSchema = z.string().trim().min(1).max(160);

async function requireNteSession() {
    const user = await getSessionUser();
    if (!user.role) throw new Error('Unauthorized');
}

export async function getNteAddresses(owner?: string) {
    await requireNteSession();

    const parsed = identifierSchema.safeParse(owner ?? '');
    if (!parsed.success) {
        return { success: false, error: 'Owner tidak valid.' };
    }

    try {
        const repo = createNteRepository(db);
        const results = await repo.listAddresses(parsed.data);
        return { success: true, data: results.rows ?? [] };
    } catch (error) {
        actionLogger.error(
            'getNteAddresses error',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: 'Gagal mengambil daftar address.' };
    }
}

export async function getNteTechnicians() {
    await requireNteSession();
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
