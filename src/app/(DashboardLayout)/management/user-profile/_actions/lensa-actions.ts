'use server';

import crypto from 'node:crypto';
import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/db';

// P3-S6 Fix: Derive a strict 32-byte key from the environment variable using SHA-256
// instead of a weak slice(0,32) which might pad weak characters or truncate.
const getEncryptionKey = () => {
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('Critical Configuration Error: MFA_ENCRYPTION_SECRET is not set.');
    }
    // Hash the secret to guarantee exactly 32 bytes of high entropy for AES-256
    return crypto.createHash('sha256').update(secret).digest();
};

function encrypt(text: string) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export async function saveLensaAccount(username: string, passwordRaw: string) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return { success: false, error: 'Unauthorized' };
        }

        const encryptedPassword = encrypt(passwordRaw);

        await sql`UPDATE auth."user" SET lensa_acount = ${JSON.stringify({ username, password: encryptedPassword })} WHERE id = ${session.user.id}`.execute(
            db
        );

        revalidatePath('/management/user-profile');
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : 'Failed to save account' };
    }
}

export async function deleteLensaAccount() {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return { success: false, error: 'Unauthorized' };
        }

        await sql`UPDATE auth."user" SET lensa_acount = NULL WHERE id = ${session.user.id}`.execute(
            db
        );

        revalidatePath('/management/user-profile');
        return { success: true };
    } catch (e: unknown) {
        return {
            success: false,
            error: e instanceof Error ? e.message : 'Failed to delete account',
        };
    }
}
