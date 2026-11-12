'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser, requireManagementAccess } from '@/lib/auth-server';
import { db, pool } from '@/lib/db/db';
import { batchGetUsersOnlineStatus } from '@/lib/presence';
import { redis } from '@/lib/redis';
import { logAuthEvent } from '@/lib/security/auth-audit.service';
import {
    listUserDevices,
    resetAllUserDevices,
    revokeUserDevice,
} from '@/lib/security/trusted-device.service';

const userIdSchema = z.string().min(1).max(64);
const revokeDeviceSchema = z.object({
    userId: z.string().min(1).max(64),
    deviceId: z.string().min(1).max(64),
});

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
            'auth.user.twoFactorEnabled',
            sql<boolean>`(auth.user.api_key IS NOT NULL)`.as('has_api_key'),
            sql<Record<string, unknown>>`auth.user.lensa_acount`.as('lensa_acount'),
            'hr.levels.level_name as role',
            sql<number>`COALESCE((SELECT COUNT(*)::int FROM auth.user_trusted_devices utd WHERE utd.user_id = auth.user.id AND utd.is_revoked = false), 0)`.as('active_devices_count'),
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
        twoFactorEnabled: user.twoFactorEnabled === true,
        active_devices_count: Number(user.active_devices_count || 0),
        is_online: user.nik ? (onlineMap.get(user.nik) ?? false) : false,
    }));
}

export async function getUserDevices(userId: string) {
    await requireManagementAccess();
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return [];
    return await listUserDevices(parsed.data);
}

export async function revokeDeviceByAdmin(userId: string, deviceId: string) {
    const admin = await requireManagementAccess();
    const parsed = revokeDeviceSchema.safeParse({ userId, deviceId });
    if (!parsed.success) return { success: false, error: 'Parameter tidak valid' };
    const success = await revokeUserDevice(parsed.data.userId, parsed.data.deviceId, admin.nik);
    revalidatePath('/management/users');
    return { success };
}

export async function resetUserMfa(userId: string) {
    const admin = await requireManagementAccess();
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return { success: false, error: 'User ID tidak valid' };
    const validUserId = parsed.data;

    // 1. Disable twoFactorEnabled on user
    await db
        .updateTable('auth.user')
        .set({ twoFactorEnabled: false })
        .where('id', '=', validUserId)
        .execute();

    // 2. Delete TOTP credentials from auth.twoFactor
    await sql`DELETE FROM auth."twoFactor" WHERE "userId" = ${validUserId}`.execute(db);

    // 3. Revoke all devices in auth.user_trusted_devices
    await resetAllUserDevices(validUserId, admin.nik);

    // 4. Invalidate user sessions so they must re-login and setup MFA
    try {
        const prevSessionsKey = `active-sessions-${validUserId}`;
        const prevTokensRaw = await redis.get(prevSessionsKey);
        if (prevTokensRaw) {
            try {
                const prevTokens: Array<{ token: string }> = JSON.parse(prevTokensRaw);
                const keys = prevTokens.map((t) => t.token).filter(Boolean);
                if (keys.length > 0) await redis.del(...keys);
            } catch {}
            await redis.del(prevSessionsKey);
        }
        await pool.query('DELETE FROM auth.session WHERE "userId" = $1', [validUserId]);
    } catch {
        // non-blocking
    }

    // 5. Audit log
    await logAuthEvent({
        userId: validUserId,
        eventType: 'MFA_RESET_BY_ADMIN',
        status: 'SUCCESS',
        reason: `MFA dan seluruh perangkat di-reset oleh Admin ${admin.nik}`,
        metadata: { adminNik: admin.nik },
    });

    revalidatePath('/management/users');
    return { success: true };
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    await requireManagementAccess();
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return;

    await db
        .updateTable('auth.user')
        .set({ is_active: isActive })
        .where('id', '=', parsed.data)
        .execute();

    revalidatePath('/management/users');
}

export async function deleteUser(userId: string) {
    await requireManagementAccess();
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return;

    await db.deleteFrom('auth.user').where('id', '=', parsed.data).execute();

    revalidatePath('/management/users');
}

export async function toggleUserApiApproval(userId: string, apprApi: boolean) {
    await requireManagementAccess();
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return;

    await db.updateTable('auth.user').set({ appr_api: apprApi }).where('id', '=', parsed.data).execute();

    revalidatePath('/management/users');
}
