'use server';

import { sql } from 'kysely';
import { db } from '@/lib/db/db';
import { redis } from '@/lib/redis';

export async function precheckLogin(email: string) {
    try {
        const user = await db
            .selectFrom('auth.user')
            .select(['id', 'nik', 'is_active'])
            .where('email', '=', email)
            .executeTakeFirst();

        if (!user) {
            return { status: 'not_found' };
        }

        if (user.is_active !== true) {
            return { status: 'inactive' };
        }

        const isOnline = await redis.get(`presence:user:${user.nik}`);
        if (isOnline) {
            return { status: 'active_session_exists' };
        }

        return { status: 'ok' };
    } catch (error) {
        console.error('Error prechecking login:', error);
        return { status: 'error' };
    }
}

export async function revokeAllUserSessions(email: string) {
    try {
        const user = await db
            .selectFrom('auth.user')
            .select(['id', 'nik'])
            .where('email', '=', email)
            .executeTakeFirst();

        if (!user) return { success: false };

        // Delete presence so the current login check passes cleanly.
        // The new session will set its own ID in presence via the heartbeat.
        await redis.del(`presence:user:${user.nik}`);

        return { success: true };
    } catch (error) {
        console.error('Error revoking sessions:', error);
        return { success: false };
    }
}
