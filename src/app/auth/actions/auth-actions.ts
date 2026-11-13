'use server';

import { headers } from 'next/headers';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { verifyTurnstileToken } from '@/lib/security/turnstile';

export async function checkEmployeeNik(nik: string, turnstileToken: string) {
    const captcha = await verifyTurnstileToken(turnstileToken);
    if (!captcha.success) {
        return { success: false, message: 'Verifikasi keamanan gagal. Silakan coba lagi.' };
    }

    const reqHeaders = await headers();
    const clientIp =
        reqHeaders.get('cf-connecting-ip') ||
        reqHeaders.get('x-real-ip') ||
        reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        '127.0.0.1';

    const rate = await rateLimit(`check_nik:${clientIp}`, 15, 60);
    if (!rate.success) {
        return {
            success: false,
            message: 'Terlalu banyak permintaan pengecekan NIK. Silakan tunggu 1 menit.',
        };
    }

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
        actionLogger.error(
            'Error checking employee NIK:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false, message: 'Terjadi kesalahan pada sistem.' };
    }
}
