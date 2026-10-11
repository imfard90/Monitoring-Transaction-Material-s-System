'use server';

import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { getSessionNik } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { generateApiKey } from '@/lib/security/api-key';

export interface UserProfileData {
    nik: string;
    email: string;
    emailVerified: boolean;
    name: string;
    is_active: boolean;
    employee_name: string | null;
    status: string | null;
    level_name: string | null;
    position_name: string | null;
    mitra_name: string | null;
    branch_name: string | null;
    area: string | null;
    regional: string | null;
    lensa_acount: Record<string, unknown> | null;
    has_api_key: boolean;
    appr_api: boolean;
}

export async function getProfileData(): Promise<{
    success: boolean;
    data?: UserProfileData;
    error?: string;
}> {
    try {
        const nik = await getSessionNik();

        if (!nik || nik === 'system') {
            return { success: false, error: 'Unauthorized' };
        }

        const profileData = await db
            .selectFrom('auth.user as u')
            .leftJoin('hr.employees as e', 'e.nik', 'u.nik')
            .leftJoin('hr.levels as l', 'l.id', 'e.level_id')
            .leftJoin('hr.positions as p', 'p.id', 'e.position_id')
            .leftJoin('hr.mitras as m', 'm.id', 'e.mitra_id')
            .leftJoin('hr.branches as b', 'b.id', 'e.branch_id')
            .select([
                'u.nik',
                'u.email',
                'u.emailVerified',
                'u.name',
                'u.is_active',
                'u.appr_api',
                sql<boolean>`(u.api_key IS NOT NULL)`.as('has_api_key'),
                sql<Record<string, unknown>>`u.lensa_acount`.as('lensa_acount'),
                'e.nama as employee_name',
                'e.status',
                'l.level_name',
                'p.position_name',
                'm.mitra_name',
                'b.branch as branch_name',
                'b.area',
                'b.regional',
            ])
            .where('u.nik', '=', nik)
            .executeTakeFirst();

        if (!profileData) {
            return { success: false, error: 'User not found' };
        }

        return {
            success: true,
            data: {
                nik: profileData.nik,
                email: profileData.email,
                emailVerified: profileData.emailVerified,
                name: profileData.name,
                is_active: profileData.is_active ?? false,
                employee_name: profileData.employee_name,
                status: profileData.status,
                level_name: profileData.level_name,
                position_name: profileData.position_name,
                mitra_name: profileData.mitra_name,
                branch_name: profileData.branch_name,
                area: profileData.area,
                regional: profileData.regional,
                lensa_acount: profileData.lensa_acount,
                has_api_key: Boolean(profileData.has_api_key),
                appr_api: Boolean(profileData.appr_api),
            },
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to fetch profile data:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Generate API key baru untuk profil user saat ini.
 * Aturan:
 * 1. Jika API key sudah ada, user harus menghapusnya terlebih dahulu.
 * 2. Generate key baru otomatis mereset appr_api menjadi false (menunggu persetujuan admin).
 * 3. Raw API key hanya dikembalikan SATU KALI saat pembuatan, tidak pernah disimpan dalam plaintext.
 */
export async function generateUserApiKey(): Promise<{
    success: boolean;
    data?: { rawKey: string };
    error?: string;
}> {
    try {
        const nik = await getSessionNik();
        if (!nik || nik === 'system') {
            return { success: false, error: 'Unauthorized' };
        }

        const user = await db
            .selectFrom('auth.user')
            .select(['id', 'api_key'])
            .where('nik', '=', nik)
            .executeTakeFirst();

        if (!user) {
            return { success: false, error: 'User tidak ditemukan' };
        }

        if (user.api_key) {
            return {
                success: false,
                error: 'API Key sudah ada. Hapus API Key lama terlebih dahulu sebelum membuat yang baru.',
            };
        }

        const { rawKey, hashedKey } = generateApiKey();

        // Update user: store hash and automatically set appr_api = false (requires admin approval)
        await db
            .updateTable('auth.user')
            .set({
                api_key: hashedKey,
                appr_api: false,
            })
            .where('id', '=', user.id)
            .execute();

        revalidatePath('/user-profile');
        return {
            success: true,
            data: { rawKey },
        };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to generate user API key:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal membuat API Key',
        };
    }
}

/**
 * Hapus API key aktif milik user saat ini.
 * Juga menonaktifkan appr_api.
 */
export async function deleteUserApiKey(): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const nik = await getSessionNik();
        if (!nik || nik === 'system') {
            return { success: false, error: 'Unauthorized' };
        }

        await db
            .updateTable('auth.user')
            .set({
                api_key: null,
                appr_api: false,
            })
            .where('nik', '=', nik)
            .execute();

        revalidatePath('/user-profile');
        return { success: true };
    } catch (error: unknown) {
        actionLogger.error(
            'Failed to delete user API key:',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal menghapus API Key',
        };
    }
}
