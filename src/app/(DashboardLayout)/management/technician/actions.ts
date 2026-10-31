'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTechnicianManagementAccess } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { hrRepository } from '@/lib/repositories/hr.repository';

export async function getTechnicians() {
    try {
        await requireTechnicianManagementAccess();

        const technicians = await hrRepository.getTechnicians();

        return technicians;
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch technicians:',
            error instanceof Error ? error : new Error(String(error))
        );
        throw new Error('Failed to load technicians');
    }
}

export async function getBranches() {
    try {
        await requireTechnicianManagementAccess();

        return await hrRepository.getBranches();
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch branches:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export async function getMitras() {
    try {
        await requireTechnicianManagementAccess();

        return await hrRepository.getMitras();
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch mitras:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export async function getWarehouses() {
    try {
        await requireTechnicianManagementAccess();

        return await db
            .selectFrom('inventory.mas_wh')
            .select(['id', 'name', 'branch'])
            .orderBy('name', 'asc')
            .execute();
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch warehouses:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export async function toggleTechnicianStatus(id: string | number, isActive: boolean) {
    try {
        await requireTechnicianManagementAccess();

        await db
            .updateTable('hr.technicians')
            .set({ is_active: isActive })
            .where('id', '=', String(id))
            .execute();

        revalidatePath('/management/technician');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to toggle technician status:',
            error instanceof Error ? error : new Error(String(error))
        );
        throw new Error('Failed to update status');
    }
}

const upsertTechnicianSchema = z.object({
    id: z.union([z.string(), z.number()]).optional(),
    nik: z
        .string()
        .transform((v) => v.replace(/[\s\u00A0]+/g, ''))
        .pipe(z.string().min(1, 'NIK wajib diisi')),
    name: z
        .string()
        .transform((v) =>
            v
                .replace(/[\u00A0]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
        )
        .pipe(z.string().min(1, 'Nama teknisi wajib diisi')),
    branch_id: z.number().int().positive().nullable(),
    mitra_id: z.number().int().positive().nullable(),
    wh_id: z.number().int().positive('Gudang wajib dipilih'),
});

export async function upsertTechnician(data: {
    id?: string | number;
    nik: string;
    name: string;
    branch_id: number | null;
    mitra_id: number | null;
    wh_id: number;
}) {
    const parsed = upsertTechnicianSchema.safeParse(data);
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Data teknisi tidak valid');
    }
    const cleanData = parsed.data;

    try {
        await requireTechnicianManagementAccess();

        if (cleanData.id) {
            await db
                .updateTable('hr.technicians')
                .set({
                    nik: cleanData.nik,
                    name: cleanData.name,
                    branch_id: cleanData.branch_id,
                    mitra_id: cleanData.mitra_id,
                    wh_id: cleanData.wh_id,
                })
                .where('id', '=', String(cleanData.id))
                .execute();
        } else {
            await db
                .insertInto('hr.technicians')
                .values({
                    nik: cleanData.nik,
                    name: cleanData.name,
                    branch_id: cleanData.branch_id,
                    mitra_id: cleanData.mitra_id,
                    wh_id: cleanData.wh_id,
                })
                .execute();
        }

        revalidatePath('/management/technician');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to upsert technician:',
            error instanceof Error ? error : new Error(String(error))
        );
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23505'
        ) {
            throw new Error('NIK tersebut sudah terdaftar pada teknisi lain.');
        }
        throw new Error(error instanceof Error ? error.message : 'Failed to save technician');
    }
}
