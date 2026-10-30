import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/db';

import { errors } from '@/lib/errors';
import { authLogger } from '@/lib/logger';
import {
    type AuthorizationUser,
    canAccessManagement,
    canAccessTechnicianManagement,
} from '@/lib/policies';
import { touchUserPresence } from '@/lib/presence';
import { redis } from '@/lib/redis';

/**
 * Helper untuk mengambil NIK pengguna dari session auth di Server Actions.
 * Akan melempar Error 'Unauthorized' jika sesi tidak valid.
 */
export async function getSessionNik(): Promise<string> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        const nik = (session?.user as any)?.nik;
        if (!nik) {
            throw errors.auth();
        }
        void touchUserPresence(redis, nik, session?.session?.id);
        return nik;
    } catch (e: any) {
        if (e.name === 'AuthenticationError') throw e;
        authLogger.error('getSessionNik Error', e);
        throw errors.auth();
    }
}

export type SessionUser = AuthorizationUser & {
    branchId: number | null;
    branchName: string | null;
};

/**
 * Helper untuk mengambil data user lengkap dari session (nik, role, warehouseIds).
 * Role di-query live dari hr.employees → hr.levels.
 * Untuk Staff, warehouse_ids di-query dari inventory.mas_wh berdasarkan pic_1/pic_2 = nik.
 * Non-staff = akses semua data (warehouseIds kosong, isStaff false).
 * Akan melempar Error 'Unauthorized' jika sesi tidak valid.
 */
export async function getSessionUser(): Promise<SessionUser> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        const user = session?.user as any;
        const nik: string = user?.nik;

        if (!nik) {
            throw errors.auth();
        }

        // Passively refresh presence for both Staff and Non-Staff on activity
        void touchUserPresence(redis, nik, session?.session?.id);

        // Query role from hr.employees → hr.levels
        const employee = await db
            .selectFrom('hr.employees as e')
            .leftJoin('hr.levels as l', 'l.id', 'e.level_id')
            .leftJoin('hr.branches as b', 'b.id', 'e.branch_id')
            .select(['l.level_name', 'e.branch_id', 'b.branch as branch_name'])
            .where('e.nik', '=', nik)
            .executeTakeFirst();

        const role = employee?.level_name ?? null;
        const branchId = employee?.branch_id ?? null;
        const branchName = employee?.branch_name ?? null;

        // For Staff: resolve warehouse_ids from mas_wh where pic_1 or pic_2 = nik
        let warehouseIds: number[] = [];
        if (role === 'Staff') {
            const whs = await db
                .selectFrom('inventory.mas_wh')
                .select('id')
                .where((eb) => eb.or([eb('pic_1', '=', nik), eb('pic_2', '=', nik)]))
                .execute();
            warehouseIds = whs.map((w) => w.id);
        }

        return {
            nik,
            role,
            warehouseIds,
            isStaff: role === 'Staff',
            branchId,
            branchName,
        };
    } catch (e: any) {
        if (e.name === 'AuthenticationError') throw e;
        authLogger.error('getSessionUser Error', e);
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
    } catch (e: any) {
        if (e?.name === 'AuthenticationError' || e?.statusCode === 401) {
            redirect('/auth/login');
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

/**
 * Helper untuk memvalidasi akses gudang tertentu bagi user yang sedang login.
 * Jika Staff: wajib terdaftar sebagai pic_1 atau pic_2 pada targetWarehouseId (fail-closed).
 * Jika Non-Staff: diizinkan akses seluruh gudang.
 * Melempar AuthorizationError jika tidak berhak (fail-closed).
 */
export async function requireWarehouseAccess(targetWarehouseId: number): Promise<SessionUser> {
    const user = await getSessionUser();
    if (user.isStaff) {
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
