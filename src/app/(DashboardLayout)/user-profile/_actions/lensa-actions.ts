'use server';

import crypto from 'crypto';
import { sql } from 'kysely';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/db';

const SECRET_KEY =
    process.env.MFA_ENCRYPTION_SECRET?.slice(0, 32) || '12345678901234567890123456789012';

function encrypt(text: string) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SECRET_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
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

        revalidatePath('/user-profile');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Failed to save account' };
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

        revalidatePath('/user-profile');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || 'Failed to delete account' };
    }
}
