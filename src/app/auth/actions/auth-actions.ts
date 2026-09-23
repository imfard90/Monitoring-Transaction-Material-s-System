'use server';

import { db } from '@/lib/db/db';

export async function checkEmployeeNik(nik: string) {
    try {
        const employee = await db
            .selectFrom('hr.employees')
            .select(['nik', 'nama', 'status'])
            .where('nik', '=', nik)
            .executeTakeFirst();

        const existingUser = await db
            .selectFrom('auth.user')
            .select('id')
            .where('nik', '=', nik)
            .executeTakeFirst();

        if (existingUser) {
            return { success: false, message: 'NIK Anda sudah terdaftar di sistem.' };
        }

        if (!employee) {
            return { success: false, message: 'NIK tidak terdaftar dalam sistem HR.' };
        }

        if (employee.status !== 'ACTIVE') {
            return { success: false, message: 'Status karyawan tidak aktif.' };
        }

        return {
            success: true,
            data: {
                nik: employee.nik,
                nama: employee.nama,
            },
        };
    } catch (error) {
        console.error('Error checking employee NIK:', error);
        return { success: false, message: 'Terjadi kesalahan pada sistem.' };
    }
}
