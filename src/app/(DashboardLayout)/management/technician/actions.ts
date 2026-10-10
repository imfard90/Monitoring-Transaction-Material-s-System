'use server';

import { revalidatePath } from 'next/cache';
import { requireManagementAccess } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { hrRepository } from '@/lib/repositories/hr.repository';
import { actionLogger } from '@/lib/logger';

export async function getTechnicians() {
    try {
        await requireManagementAccess();

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
        await requireManagementAccess();

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
        await requireManagementAccess();

        return await hrRepository.getMitras();
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch mitras:',
            error instanceof Error ? error : new Error(String(error))
        );
        return [];
    }
}

export async function toggleTechnicianStatus(id: string | number, isActive: boolean) {
    try {
        await requireManagementAccess();

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

export async function upsertTechnician(data: {
    id?: string | number;
    nik: string;
    name: string;
    branch_id: number | null;
    mitra_id: number | null;
}) {
    try {
        await requireManagementAccess();

        if (data.id) {
            await db
                .updateTable('hr.technicians')
                .set({
                    nik: data.nik,
                    name: data.name,
                    branch_id: data.branch_id,
                    mitra_id: data.mitra_id,
                })
                .where('id', '=', String(data.id))
                .execute();
        } else {
            await db
                .insertInto('hr.technicians')
                .values({
                    nik: data.nik,
                    name: data.name,
                    branch_id: data.branch_id,
                    mitra_id: data.mitra_id,
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
        throw new Error('Failed to save technician');
    }
}
