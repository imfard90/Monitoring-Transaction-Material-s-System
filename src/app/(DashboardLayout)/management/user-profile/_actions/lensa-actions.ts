'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { encryptLensaPassword } from '@/lib/crypto/lensa-credential';
import { userRepository } from '@/lib/repositories/user.repository';

const lensAccountSchema = z.object({
    username: z
        .string()
        .trim()
        .min(1, 'Username Lensa wajib diisi')
        .max(100, 'Username Lensa terlalu panjang'),
    passwordRaw: z
        .string()
        .min(1, 'Password Lensa wajib diisi')
        .max(200, 'Password Lensa terlalu panjang'),
});

export type LensAccountResult =
    | { success: true }
    | { success: false; error: string };

/**
 * Simpan kredensial Lensa milik user yang sedang login.
 *
 * Password dienkripsi AES-256-GCM sebelum disimpan; plaintext tidak pernah
 * ditulis ke database maupun log (AGENTS.md §1.1, §3.2).
 */
export async function saveLensaAccount(
    username: string,
    passwordRaw: string
): Promise<LensAccountResult> {
    const parsed = lensAccountSchema.safeParse({ username, passwordRaw });
    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message ?? 'Data akun Lensa tidak valid',
        };
    }

    try {
        // Otorisasi server action (AGENTS.md §1.1) — fail-closed.
        const session = await getSessionUser();
        if (!session?.nik || session.nik === 'system') {
            return { success: false, error: 'Sesi tidak valid. Silakan login kembali.' };
        }

        const userId = await userRepository.getUserIdByNik(session.nik);
        if (!userId) {
            return { success: false, error: 'User tidak ditemukan.' };
        }

        const encryptedPassword = encryptLensaPassword(parsed.data.passwordRaw);

        await userRepository.setLensaAccountByUserId(userId, {
            username: parsed.data.username,
            password: encryptedPassword,
        });

        revalidatePath('/management/user-profile');
        return { success: true };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal menyimpan akun Lensa',
        };
    }
}

/**
 * Hapus kredensial Lensa milik user yang sedang login.
 */
export async function deleteLensaAccount(): Promise<LensAccountResult> {
    try {
        // Otorisasi server action (AGENTS.md §1.1) — fail-closed.
        const session = await getSessionUser();
        if (!session?.nik || session.nik === 'system') {
            return { success: false, error: 'Sesi tidak valid. Silakan login kembali.' };
        }

        const userId = await userRepository.getUserIdByNik(session.nik);
        if (!userId) {
            return { success: false, error: 'User tidak ditemukan.' };
        }

        await userRepository.setLensaAccountByUserId(userId, null);

        revalidatePath('/management/user-profile');
        return { success: true };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal menghapus akun Lensa',
        };
    }
}
