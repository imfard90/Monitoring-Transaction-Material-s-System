import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { sessionMetaLru } from '@/lib/cache/lru-cache';
import { db } from '@/lib/db/db';

import { errors } from '@/lib/errors';
import { authLogger } from '@/lib/logger';
import {
    type AuthorizationUser,
    canAccessManagement,
    canAccessTechnicianManagement,
    isSuperUserFromEnv,
    type RoleKey,
    requirePermission,
    type ScopeBoundary,
} from '@/lib/policies';
import { touchUserPresence } from '@/lib/presence';
import { redis } from '@/lib/redis';
import { rbacRepository } from '@/lib/repositories/rbac.repository';
import { validateSessionIntegrity } from '@/lib/security/session-anomaly.service';

/**
 * Read a property off an unknown error value without widening to `any`.
 *
 * Next.js / Better Auth attach non-standard fields (`digest`, `code`) to
 * thrown errors, so the shape cannot be described by a concrete type.
 */
function getErrorProp(error: unknown, prop: string): unknown {
    if (typeof error !== 'object' || error === null) return undefined;
    return (error as Record<string, unknown>)[prop];
}

/**
 * Helper untuk mengambil NIK pengguna dari session auth di Server Actions.
 * Akan melempar Error 'Unauthorized' jika sesi tidak valid.
 */
export async function getSessionNik(): Promise<string> {
    try {
        const reqHeaders = await headers();
        const session = await auth.api.getSession({
            headers: reqHeaders,
        });
        const user = session?.user as { id?: string; nik?: string } | undefined;
        const nik = user?.nik;
        if (!nik) {
            throw errors.auth();
        }

        if (session?.session?.id && user?.id) {
            await validateSessionIntegrity(
                {
                    id: session.session.id,
                    userId: user.id,
                    token: session.session.token,
                    user: { nik },
                },
                reqHeaders
            );
        }

        void touchUserPresence(redis, nik, session?.session?.id);
        return nik;
    } catch (e: unknown) {
        if (getErrorProp(e, 'name') === 'AuthenticationError') throw e;
        authLogger.error('getSessionNik Error', e instanceof Error ? e : new Error(String(e)));
        throw errors.auth();
    }
}

export type SessionUser = AuthorizationUser & {
    userId?: string;
    email?: string;
    isSuperUser: boolean;
    roleKey: RoleKey | null;
    hierarchyLevel: number;
    permissions: string[];
    scopeBoundary: ScopeBoundary;
    branchId: number | null;
    branchName: string | null;
};

const EMPTY_SCOPE_BOUNDARY: ScopeBoundary = {
    area: null,
    regional: null,
    branch: null,
    serviceArea: null,
};

export async function invalidateUserSessionMetaCache(nik: string): Promise<void> {
    if (!nik) return;
    const cacheKey = `cache:user:session-meta:${nik}`;
    sessionMetaLru.delete(cacheKey);
    try {
        await redis.del(cacheKey);
    } catch {
        // Non-blocking cache invalidation
    }
}

/**
 * Helper untuk mengambil data user lengkap dari session (nik, role, permissions, warehouseIds).
 * Prioritas 1: SuperUser dari .env (validasi ganda email + nik).
 * Prioritas 2: auth.user_scopes + auth.role_permissions (RBAC + SBAC).
 * Fallback aman (fail-closed) jika scope belum terdaftar.
 * Akan melempar Error 'Unauthorized' jika sesi tidak valid.
 */
export async function getSessionUser(): Promise<SessionUser> {
    try {
        const reqHeaders = await headers();
        const session = await auth.api.getSession({
            headers: reqHeaders,
        });

        const user = session?.user as { id?: string; nik?: string; email?: string } | undefined;
        const nik: string = user?.nik ?? '';
        const userId: string | undefined = user?.id;
        const email: string | undefined = user?.email;

        if (!nik) {
            throw errors.auth();
        }

        // Validate session integrity against baseline (Flag Odd Jumps anomaly guard)
        if (session?.session?.id && userId) {
            await validateSessionIntegrity(
                {
                    id: session.session.id,
                    userId,
                    token: session.session.token,
                    user: { nik },
                },
                reqHeaders
            );
        }

        // Passively refresh presence for both Staff and Non-Staff on activity
        void touchUserPresence(redis, nik, session?.session?.id);

        const isSuperUser = isSuperUserFromEnv(email, nik);
        const cacheKey = `cache:user:session-meta:${nik}`;
        type SessionMetaData = {
            role: string | null;
            branchId: number | null;
            branchName: string | null;
            warehouseIds: number[];
            isStaff: boolean;
            isSuperUser: boolean;
            roleKey: RoleKey | null;
            hierarchyLevel: number;
            permissions: string[];
            scopeBoundary: ScopeBoundary;
        };

        // 1. Check Tier-1: Local In-Memory LRU Cache (0ms)
        const l1Cached = sessionMetaLru.get(cacheKey) as SessionMetaData | undefined;
        if (l1Cached && l1Cached.isSuperUser === isSuperUser) {
            return {
                userId,
                email,
                nik,
                ...l1Cached,
            };
        }

        // 2. Check Tier-2: Distributed Redis Cache (1-3ms)
        let cachedMeta: SessionMetaData | null = null;
        try {
            const raw = await redis.get(cacheKey);
            if (raw) {
                const parsed = JSON.parse(raw) as SessionMetaData;
                if (typeof parsed.isSuperUser === 'boolean' && parsed.isSuperUser === isSuperUser) {
                    cachedMeta = parsed;
                }
            }
        } catch {
            // Redis unavailable or parse failed: proceed to query DB gracefully
        }

        if (cachedMeta) {
            sessionMetaLru.set(cacheKey, cachedMeta, { ttl: 30 * 1000 });
            return {
                userId,
                email,
                nik,
                ...cachedMeta,
            };
        }

        // Query employee reference from hr.employees -> hr.levels & hr.branches
        const employee = await db
            .selectFrom('hr.employees as e')
            .leftJoin('hr.levels as l', 'l.id', 'e.level_id')
            .leftJoin('hr.branches as b', 'b.id', 'e.branch_id')
            .select(['l.level_name', 'e.branch_id', 'b.branch as branch_name'])
            .where('e.nik', '=', nik)
            .executeTakeFirst();

        const branchId = employee?.branch_id ?? null;
        const branchName = employee?.branch_name ?? null;

        let sessionMeta: SessionMetaData;

        if (isSuperUser) {
            sessionMeta = {
                role: 'SuperUser',
                warehouseIds: [],
                isStaff: false,
                isSuperUser: true,
                roleKey: null,
                hierarchyLevel: 0,
                permissions: ['*'],
                scopeBoundary: EMPTY_SCOPE_BOUNDARY,
                branchId,
                branchName,
            };
        } else {
            const scopes = await rbacRepository.getActiveUserScopes(nik);

            if (scopes.length > 0) {
                const primary = scopes[0];
                const [{ warehouseIds, scopeBoundary }, permissions] = await Promise.all([
                    rbacRepository.resolveWarehouseIdsFromScopes(scopes),
                    rbacRepository.getPermissionsByRoleId(primary.role_id),
                ]);

                sessionMeta = {
                    role: employee?.level_name ?? primary.role_name,
                    warehouseIds,
                    isStaff: primary.role_key === 'STAFF_GUDANG',
                    isSuperUser: false,
                    roleKey: primary.role_key,
                    hierarchyLevel: primary.hierarchy_level,
                    permissions,
                    scopeBoundary,
                    branchId,
                    branchName,
                };
            } else {
                // Fail-closed: user belum memiliki mapping scope aktif di auth.user_scopes
                sessionMeta = {
                    role: employee?.level_name ?? null,
                    warehouseIds: [],
                    isStaff: employee?.level_name === 'Staff',
                    isSuperUser: false,
                    roleKey: null,
                    hierarchyLevel: employee?.level_name === 'Teknisi' ? 6 : 99,
                    permissions: [],
                    scopeBoundary: EMPTY_SCOPE_BOUNDARY,
                    branchId,
                    branchName,
                };
            }
        }

        // Cache for 60 seconds in L2 Redis and 30 seconds in L1 LRU Cache
        try {
            await redis.set(cacheKey, JSON.stringify(sessionMeta), 'EX', 60);
        } catch {
            // Non-blocking cache write failure
        }
        sessionMetaLru.set(cacheKey, sessionMeta, { ttl: 30 * 1000 });

        return {
            userId,
            email,
            nik,
            ...sessionMeta,
        };
    } catch (e: unknown) {
        const errorName = getErrorProp(e, 'name');
        const errorDigest = getErrorProp(e, 'digest');
        const errorCode = getErrorProp(e, 'code');
        if (errorName === 'AuthenticationError') throw e;
        if (typeof errorDigest === 'string' && errorDigest.includes('NEXT_REDIRECT')) throw e;
        if (
            errorCode === 'ECONNRESET' ||
            errorName === 'AbortError' ||
            errorDigest === '511400414'
        ) {
            throw e;
        }
        authLogger.error('getSessionUser Error', e instanceof Error ? e : new Error(String(e)));
        throw errors.auth();
    }
}

/**
 * Helper untuk Server Component (Page / Layout).
 * Mengambil data sesi; jika tidak terautentikasi atau sesi kadaluwarsa,
 * otomatis me-redirect browser ke /auth/login tanpa melempar uncaught exception.
 */
export async function getPageSessionUser(): Promise<SessionUser> {
    try {
        return await getSessionUser();
    } catch (e: unknown) {
        const errorName = getErrorProp(e, 'name');
        const errorDigest = getErrorProp(e, 'digest');
        const errorCode = getErrorProp(e, 'code');
        if (typeof errorDigest === 'string' && errorDigest.includes('NEXT_REDIRECT')) throw e;
        if (
            errorCode === 'ECONNRESET' ||
            errorName === 'AbortError' ||
            errorDigest === '511400414'
        ) {
            throw e;
        }
        if (errorName === 'AuthenticationError' || getErrorProp(e, 'statusCode') === 401) {
            redirect('/auth/login?reason=expired');
        }
        throw e;
    }
}

/**
 * Helper untuk mengecek apakah user berhak akses menu management.
 * Admin = semua role non-Staff kecuali Teknisi.
 * Melempar AuthorizationError jika tidak berhak (fail-closed).
 */
export async function requireManagementAccess(): Promise<SessionUser> {
    const session = await getSessionUser();
    if (!canAccessManagement(session)) {
        throw errors.accessDenied();
    }
    return session;
}

/**
 * Helper untuk mengecek apakah user berhak akses manajemen teknisi.
 * Staff & level lain diizinkan, kecuali Teknisi. Melempar AuthorizationError jika tidak berhak (fail-closed).
 */
export async function requireTechnicianManagementAccess(): Promise<SessionUser> {
    const session = await getSessionUser();
    if (!canAccessTechnicianManagement(session)) {
        throw errors.accessDenied();
    }
    return session;
}

export async function requirePermissionAccess(
    permissionKey: string,
    message?: string
): Promise<SessionUser> {
    const session = await getSessionUser();
    requirePermission(session, permissionKey, message);
    return session;
}

/**
 * Helper untuk memvalidasi akses gudang tertentu bagi user yang sedang login.
 * Memeriksa cakupan wilayah (warehouseIds) untuk seluruh user non-SuperUser.
 * Melempar AuthorizationError jika tidak berhak (fail-closed).
 */
export async function requireWarehouseAccess(targetWarehouseId: number): Promise<SessionUser> {
    const user = await getSessionUser();
    if (user.isSuperUser) {
        return user;
    }
    if (user.isStaff || user.roleKey !== undefined) {
        if (
            !user.warehouseIds ||
            user.warehouseIds.length === 0 ||
            !user.warehouseIds.includes(targetWarehouseId)
        ) {
            throw errors.accessDenied(
                'Akses ditolak: Anda tidak memiliki wewenang untuk gudang ini.'
            );
        }
    }
    return user;
}
