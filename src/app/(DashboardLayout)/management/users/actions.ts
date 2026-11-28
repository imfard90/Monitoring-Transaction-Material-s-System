'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
    getSessionUser,
    invalidateUserSessionMetaCache,
    requireManagementAccess,
    requirePermissionAccess,
} from '@/lib/auth-server';
import { db, pool } from '@/lib/db/db';
import { canAssignRole, isSuperUserFromEnv, type RoleKey } from '@/lib/policies';
import { batchGetUsersOnlineStatus } from '@/lib/presence';
import { redis } from '@/lib/redis';
import { rbacRepository } from '@/lib/repositories/rbac.repository';
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

const saveUserScopeSchema = z.object({
    userNik: z.string().trim().min(1).max(20),
    roleKey: z.enum([
        'PEJABAT_AREA',
        'PEJABAT_REGIONAL',
        'PEJABAT_BRANCH',
        'TL_SA',
        'STAFF_GUDANG',
        'TEKNISI',
    ]),
    area: z.string().trim().max(50).nullable().optional(),
    regional: z.string().trim().max(50).nullable().optional(),
    branch: z.string().trim().max(100).nullable().optional(),
    serviceArea: z.string().trim().max(100).nullable().optional(),
    warehouseIds: z.array(z.number().int().positive()).default([]),
    validUntil: z.string().datetime({ offset: true }).or(z.string().min(1)).nullable().optional(),
});

function formatScopeSummary(
    isSuperUser: boolean,
    roleKey: RoleKey | null,
    scopes: Array<{
        area: string | null;
        regional: string | null;
        branch: string | null;
        service_area: string | null;
        warehouse_name: string | null;
    }>
): string {
    if (isSuperUser) return 'Seluruh Wilayah (SuperUser)';
    if (!roleKey || scopes.length === 0) return 'Belum Diatur';

    const first = scopes[0];
    if (roleKey === 'PEJABAT_AREA') return first.area ? `Area: ${first.area}` : 'Area: -';
    if (roleKey === 'PEJABAT_REGIONAL')
        return first.regional ? `Regional: ${first.regional}` : 'Regional: -';
    if (roleKey === 'PEJABAT_BRANCH') return first.branch ? `Branch: ${first.branch}` : 'Branch: -';
    if (roleKey === 'TL_SA') return first.service_area ? `SA: ${first.service_area}` : 'SA: -';
    if (roleKey === 'STAFF_GUDANG') {
        const names = scopes.map((s) => s.warehouse_name).filter((n): n is string => Boolean(n));
        if (names.length === 0) return 'Gudang: -';
        return names.length <= 2
            ? `WH: ${names.join(', ')}`
            : `WH: ${names.slice(0, 2).join(', ')} (+${names.length - 2})`;
    }
    return 'Personal (NIK)';
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
            sql<number>`COALESCE((SELECT COUNT(*)::int FROM auth.user_trusted_devices utd WHERE utd.user_id = auth.user.id AND utd.is_revoked = false), 0)`.as(
                'active_devices_count'
            ),
        ])
        .orderBy('auth.user.name', 'asc')
        .execute();

    // Batch-query Redis presence & active RBAC/SBAC scopes
    const validNiks = users.map((u) => u.nik).filter((nik): nik is string => Boolean(nik));
    const [onlineMap, allScopes] = await Promise.all([
        batchGetUsersOnlineStatus(redis, validNiks),
        rbacRepository.getAllActiveUserScopes(),
    ]);

    const scopesByNik = new Map<string, typeof allScopes>();
    for (const s of allScopes) {
        const list = scopesByNik.get(s.user_nik) ?? [];
        list.push(s);
        scopesByNik.set(s.user_nik, list);
    }

    return users.map((user) => {
        const isSuperUser = isSuperUserFromEnv(user.email, user.nik);
        const userScopes = user.nik ? (scopesByNik.get(user.nik) ?? []) : [];
        const primaryScope = userScopes[0] ?? null;

        return {
            ...user,
            twoFactorEnabled: user.twoFactorEnabled === true,
            active_devices_count: Number(user.active_devices_count || 0),
            is_online: user.nik ? (onlineMap.get(user.nik) ?? false) : false,
            is_superuser: isSuperUser,
            rbac_role_key: primaryScope?.role_key ?? null,
            rbac_role_name: isSuperUser ? 'SuperUser' : (primaryScope?.role_name ?? null),
            rbac_hierarchy_level: isSuperUser ? 0 : (primaryScope?.hierarchy_level ?? 99),
            scope_area: primaryScope?.area ?? null,
            scope_regional: primaryScope?.regional ?? null,
            scope_branch: primaryScope?.branch ?? null,
            scope_service_area: primaryScope?.service_area ?? null,
            scope_warehouse_ids: userScopes
                .map((s) => s.warehouse_id)
                .filter((id): id is number => id !== null && id > 0),
            scope_valid_until: primaryScope?.valid_until
                ? primaryScope.valid_until.toISOString()
                : null,
            scope_summary: formatScopeSummary(
                isSuperUser,
                primaryScope?.role_key ?? null,
                userScopes
            ),
        };
    });
}

export async function getScopeHierarchyConfig() {
    await requireManagementAccess();
    const [roles, options] = await Promise.all([
        rbacRepository.getRoles(),
        rbacRepository.getScopeHierarchyOptions(),
    ]);
    return {
        roles,
        branches: options.branches,
        warehouses: options.warehouses,
    };
}

export async function saveUserScopeMappingAction(
    rawPayload: z.infer<typeof saveUserScopeSchema>
): Promise<{ success: boolean; error?: string }> {
    try {
        const actor = await requirePermissionAccess(
            'users:manage',
            'Akses ditolak: Anda tidak memiliki izin untuk mengatur Role & Scope pengguna.'
        );

        const parsed = saveUserScopeSchema.safeParse(rawPayload);
        if (!parsed.success) {
            return {
                success: false,
                error: parsed.error.issues[0]?.message || 'Data Role & Scope tidak valid.',
            };
        }

        const data = parsed.data;
        const roles = await rbacRepository.getRoles();
        const targetRole = roles.find((r) => r.role_key === data.roleKey);
        if (!targetRole) {
            return { success: false, error: 'Role tujuan tidak ditemukan.' };
        }

        if (!canAssignRole(actor, targetRole.hierarchy_level)) {
            return {
                success: false,
                error: 'Akses ditolak: Anda tidak dapat memberikan role lebih tinggi dari level Anda.',
            };
        }

        const parsedValidUntil = data.validUntil ? new Date(data.validUntil) : null;
        if (parsedValidUntil && Number.isNaN(parsedValidUntil.getTime())) {
            return { success: false, error: 'Format tanggal masa berlaku PLT tidak valid.' };
        }

        await rbacRepository.saveUserScopeMapping({
            userNik: data.userNik,
            roleKey: data.roleKey as RoleKey,
            area: data.area ?? null,
            regional: data.regional ?? null,
            branch: data.branch ?? null,
            serviceArea: data.serviceArea ?? null,
            warehouseIds: data.warehouseIds,
            validUntil: parsedValidUntil,
            actorNik: actor.nik,
        });

        await invalidateUserSessionMetaCache(data.userNik);

        await logAuthEvent({
            userId: actor.userId,
            nik: actor.nik,
            eventType: 'USER_SCOPE_UPDATED',
            status: 'SUCCESS',
            reason: `Role & Scope untuk NIK ${data.userNik} diubah menjadi ${data.roleKey} oleh ${actor.nik}`,
            metadata: {
                targetNik: data.userNik,
                roleKey: data.roleKey,
                branch: data.branch ?? null,
                warehouseIds: data.warehouseIds,
                actorNik: actor.nik,
            },
        });

        revalidatePath('/management/users');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Gagal menyimpan konfigurasi Role & Scope.',
        };
    }
}

const saveRolePermissionsSchema = z.object({
    roleId: z.number().int().positive(),
    permissionKeys: z.array(z.string().trim().min(1).max(100)),
});

export async function getRolePermissionMatrixAction() {
    await requireManagementAccess();
    return rbacRepository.getRolePermissionMatrix();
}

export async function saveRolePermissionsAction(
    rawPayload: z.infer<typeof saveRolePermissionsSchema>
): Promise<{ success: boolean; error?: string }> {
    try {
        const actor = await requirePermissionAccess(
            'users:manage',
            'Akses ditolak: Anda tidak memiliki izin untuk mengubah matriks wewenang.'
        );

        const parsed = saveRolePermissionsSchema.safeParse(rawPayload);
        if (!parsed.success) {
            return {
                success: false,
                error: parsed.error.issues[0]?.message || 'Payload wewenang tidak valid.',
            };
        }

        const { roleId, permissionKeys } = parsed.data;
        const roles = await rbacRepository.getRoles();
        const targetRole = roles.find((r) => r.id === roleId);
        if (!targetRole) {
            return { success: false, error: 'Role tujuan tidak ditemukan.' };
        }

        if (!canAssignRole(actor, targetRole.hierarchy_level)) {
            return {
                success: false,
                error: 'Akses ditolak: Anda tidak dapat mengubah wewenang role yang lebih tinggi dari level Anda.',
            };
        }

        const { affectedNiks } = await rbacRepository.saveRolePermissions(roleId, permissionKeys);

        await Promise.all(affectedNiks.map((nik) => invalidateUserSessionMetaCache(nik)));

        await logAuthEvent({
            userId: actor.userId,
            nik: actor.nik,
            eventType: 'ROLE_PERMISSIONS_UPDATED',
            status: 'SUCCESS',
            reason: `Wewenang role ${targetRole.role_key} diperbarui (${permissionKeys.length} izin) oleh ${actor.nik}`,
            metadata: {
                roleId,
                roleKey: targetRole.role_key,
                permissionCount: permissionKeys.length,
                affectedUsers: affectedNiks.length,
                actorNik: actor.nik,
            },
        });

        revalidatePath('/management/users');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error:
                error instanceof Error ? error.message : 'Gagal menyimpan matriks wewenang role.',
        };
    }
}

export async function getUserDevices(userId: string) {
    await requireManagementAccess();
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return [];
    return await listUserDevices(parsed.data);
}

export async function revokeDeviceByAdmin(userId: string, deviceId: string) {
    const admin = await requirePermissionAccess('users:manage');
    const parsed = revokeDeviceSchema.safeParse({ userId, deviceId });
    if (!parsed.success) return { success: false, error: 'Parameter tidak valid' };
    const success = await revokeUserDevice(parsed.data.userId, parsed.data.deviceId, admin.nik);
    revalidatePath('/management/users');
    return { success };
}

export async function resetUserMfa(userId: string) {
    const admin = await requirePermissionAccess('users:manage');
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
        await pool.query({
            name: 'auth-delete-user-sessions',
            text: 'DELETE FROM auth.session WHERE "userId" = $1',
            values: [validUserId],
        });
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
    await requirePermissionAccess('users:manage');
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
    await requirePermissionAccess('users:manage');
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return;

    await db.deleteFrom('auth.user').where('id', '=', parsed.data).execute();

    revalidatePath('/management/users');
}

export async function toggleUserApiApproval(userId: string, apprApi: boolean) {
    await requirePermissionAccess('users:manage');
    const parsed = userIdSchema.safeParse(userId);
    if (!parsed.success) return;

    await db
        .updateTable('auth.user')
        .set({ appr_api: apprApi })
        .where('id', '=', parsed.data)
        .execute();

    revalidatePath('/management/users');
}
