'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionUser, requireManagementAccess } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { batchGetUsersOnlineStatus } from '@/lib/presence';
import { redis } from '@/lib/redis';

/**
 * Cek apakah user adalah Staff (untuk menyembunyikan menu di sidebar).
 * Fail-closed: jika sesi invalid, anggap Staff (sembunyikan menu).
 * Ini BUKAN kontrol keamanan — hanya untuk UI. Otorisasi sebenarnya ada di server action.
 */
export async function checkIsStaff() {
    try {
        const session = await getSessionUser();
        return session.isStaff;
    } catch {
        return true; // fail-closed: assume staff to hide menus
    }
}

export interface SidebarUserAccess {
    isStaff: boolean;
    isTeknisi: boolean;
}

/**
 * Cek akses role untuk penyaringan menu sidebar.
 * Fail-closed: jika sesi invalid, anggap restricted (sembunyikan menu sensitif).
 */
export async function getSidebarUserAccess(): Promise<SidebarUserAccess> {
    try {
        const session = await getSessionUser();
        return {
            isStaff: session.isStaff,
            isTeknisi: session.role === 'Teknisi',
        };
    } catch {
        return {
            isStaff: true,
            isTeknisi: true, // fail-closed: assume restricted to hide menus
        };
    }
}

export async function isUserOnline(nik: string): Promise<boolean> {
    await requireManagementAccess();
    const statusMap = await batchGetUsersOnlineStatus(redis, [nik]);
    return statusMap.get(nik) ?? false;
}

export async function getUsers() {
    await requireManagementAccess();

    // Query auth.user and optionally join with hr.employees to get roles
    const users = await db
        .selectFrom('auth.user')
        .leftJoin('hr.employees', 'hr.employees.nik', 'auth.user.nik')
        .leftJoin('hr.levels', 'hr.levels.id', 'hr.employees.level_id')
        .select([
            'auth.user.id',
            'auth.user.name',
            'auth.user.email',
            'auth.user.nik',
            'auth.user.is_active',
            'auth.user.appr_api',
            sql<boolean>`(auth.user.api_key IS NOT NULL)`.as('has_api_key'),
            sql<Record<string, unknown>>`auth.user.lensa_acount`.as('lensa_acount'),
            'hr.levels.level_name as role',
        ])
        .orderBy('auth.user.name', 'asc')
        .execute();

    // Batch-query Redis presence for all users in a single roundtrip (O(1) network calls)
    const validNiks = users
        .map((u) => u.nik)
        .filter((nik): nik is string => Boolean(nik));
    const onlineMap = await batchGetUsersOnlineStatus(redis, validNiks);

    return users.map((user) => ({
        ...user,
        is_online: user.nik ? (onlineMap.get(user.nik) ?? false) : false,
    }));
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    await requireManagementAccess();

    await db
        .updateTable('auth.user')
        .set({ is_active: isActive })
        .where('id', '=', userId)
        .execute();

    revalidatePath('/management/users');
}

export async function deleteUser(userId: string) {
    await requireManagementAccess();

    // Usually you want to also delete sessions/accounts, but better-auth might handle this if ON DELETE CASCADE is set.
    // We'll delete from auth.user
    await db.deleteFrom('auth.user').where('id', '=', userId).execute();

    revalidatePath('/management/users');
}

export async function toggleUserApiApproval(userId: string, apprApi: boolean) {
    await requireManagementAccess();

    await db.updateTable('auth.user').set({ appr_api: apprApi }).where('id', '=', userId).execute();

    revalidatePath('/management/users');
}
