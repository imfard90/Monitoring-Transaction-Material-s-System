'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionUser, requireManagementAccess } from '@/lib/auth-server';
import { errors } from '@/lib/errors';
import { db } from '@/lib/db/db';
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
            sql<Record<string, unknown>>`auth.user.lensa_acount`.as('lensa_acount'),
            'hr.levels.level_name as role',
        ])
        .orderBy('auth.user.name', 'asc')
        .execute();

    const usersWithPresence = users.map((u) => ({
        ...u,
        is_online: false,
    }));

    // Map presence status from Redis
    if (usersWithPresence.length > 0) {
        const keys = usersWithPresence.map((u) => `presence:user:${u.nik}`);
        const onlineStatuses = await redis.mget(keys);

        usersWithPresence.forEach((u, i) => {
            u.is_online = !!onlineStatuses[i];
        });
    }

    return usersWithPresence;
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
