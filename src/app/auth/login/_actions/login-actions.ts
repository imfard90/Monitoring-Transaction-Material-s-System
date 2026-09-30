'use server';

import { z } from 'zod';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { redis } from '@/lib/redis';

const emailSchema = z.string().email();

export async function precheckLogin(email: string) {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return { status: 'error' };

    // Limit to 10 attempts per minute per email
    const rate = await rateLimit(`login_precheck:${email}`, { limit: 10, windowMs: 60000 });
    if (!rate.success) {
        return { status: 'rate_limited' }; // You might want to handle this on the frontend
    }

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
        actionLogger.error(
            'Error prechecking login:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { status: 'error' };
    }
}

export async function revokeAllUserSessions(email: string) {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return { success: false };

    // Limit to 5 attempts per 5 minutes per email
    const rate = await rateLimit(`login_revoke:${email}`, { limit: 5, windowMs: 300000 });
    if (!rate.success) return { success: false };

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
        actionLogger.error(
            'Error revoking sessions:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false };
    }
}
