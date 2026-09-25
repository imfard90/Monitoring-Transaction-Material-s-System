'use server';

import { sql } from 'kysely';
import { getSessionNik } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

export interface UserProfileData {
    nik: string;
    email: string;
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
    lensa_acount: any | null;
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
                'u.name',
                'u.is_active',
                sql<any>`u.lensa_acount`.as('lensa_acount'),
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
            },
        };
    } catch (error: unknown) {
        console.error('Failed to fetch profile data:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
