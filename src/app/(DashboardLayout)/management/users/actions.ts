'use server';

import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export async function checkIsStaff() {
    try {
        const session = await getSessionUser();
        return session.isStaff;
    } catch {
        return true; // fail-safe: assume staff to hide menus
    }
}

export async function getUsers() {
    const session = await getSessionUser();
    if (session.isStaff) {
        throw new Error('Unauthorized');
    }

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
            'hr.levels.level_name as role',
        ])
        .orderBy('auth.user.name', 'asc')
        .execute();

    return users;
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    const session = await getSessionUser();
    if (session.isStaff) {
        throw new Error('Unauthorized');
    }

    await db
        .updateTable('auth.user')
        .set({ is_active: isActive })
        .where('id', '=', userId)
        .execute();

    revalidatePath('/management/users');
}

export async function deleteUser(userId: string) {
    const session = await getSessionUser();
    if (session.isStaff) {
        throw new Error('Unauthorized');
    }

    // Usually you want to also delete sessions/accounts, but better-auth might handle this if ON DELETE CASCADE is set.
    // We'll delete from auth.user
    await db.deleteFrom('auth.user').where('id', '=', userId).execute();

    revalidatePath('/management/users');
}
