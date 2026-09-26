'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export async function getTechnicians() {
    try {
        const technicians = await db
            .selectFrom('hr.technicians as t')
            .leftJoin('hr.branches as b', 'b.id', 't.branch_id')
            .leftJoin('hr.mitras as m', 'm.id', 't.mitra_id')
            .select([
                't.id',
                't.nik',
                't.name',
                't.is_active',
                't.branch_id',
                't.mitra_id',
                'b.service_area',
                'm.mitra_name',
            ])
            .orderBy('t.name', 'asc')
            .execute();

        return technicians;
    } catch (error: any) {
        console.error('Failed to fetch technicians:', error);
        throw new Error('Failed to load technicians');
    }
}

export async function getBranches() {
    try {
        return await db
            .selectFrom('hr.branches')
            .select(['id', 'service_area', 'branch'])
            .orderBy('service_area', 'asc')
            .execute();
    } catch (error: any) {
        console.error('Failed to fetch branches:', error);
        return [];
    }
}

export async function getMitras() {
    try {
        return await db
            .selectFrom('hr.mitras')
            .select(['id', 'mitra_name'])
            .orderBy('mitra_name', 'asc')
            .execute();
    } catch (error: any) {
        console.error('Failed to fetch mitras:', error);
        return [];
    }
}

export async function toggleTechnicianStatus(id: string | number, isActive: boolean) {
    try {
        const _session = await getSessionUser();
        await db
            .updateTable('hr.technicians')
            .set({ is_active: isActive })
            .where('id', '=', String(id))
            .execute();

        revalidatePath('/management/technician');
        return { success: true };
    } catch (error: any) {
        console.error('Failed to toggle technician status:', error);
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
        const _session = await getSessionUser();

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
    } catch (error: any) {
        console.error('Failed to upsert technician:', error);
        throw new Error('Failed to save technician');
    }
}
