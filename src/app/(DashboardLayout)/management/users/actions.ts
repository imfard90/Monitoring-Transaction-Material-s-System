'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionUser, requireManagementAccess } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { getPresenceIndexKey, hasActivePresence } from '@/lib/presence';
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

async function isUserOnline(nik: string): Promise<boolean> {
    const indexMarker = await redis.get(getPresenceIndexKey(nik));

    if (indexMarker !== '1') return false;

    const keys: string[] = [];
    let cursor = '0';
    const pattern = `presence:user:${encodeURIComponent(nik)}:*`;

    do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length === 0) return false;
    const sessions = await redis.mget(keys);
    return hasActivePresence(indexMarker, sessions);
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

    const usersWithPresence = users.map((u) => ({
        ...u,
        is_online: false,
    }));

    // Check the per-user session keys; any live heartbeat means online.
    if (usersWithPresence.length > 0) {
        const onlineStatuses = await Promise.all(
            usersWithPresence.map((user) => (user.nik ? isUserOnline(user.nik) : false))
        );

        usersWithPresence.forEach((user, index) => {
            user.is_online = onlineStatuses[index] ?? false;
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

export async function toggleUserApiApproval(userId: string, apprApi: boolean) {
    await requireManagementAccess();

    await db.updateTable('auth.user').set({ appr_api: apprApi }).where('id', '=', userId).execute();

    revalidatePath('/management/users');
}
