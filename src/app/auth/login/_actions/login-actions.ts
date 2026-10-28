'use server';

import { sql } from 'kysely';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import { actionLogger } from '@/lib/logger';
import { clearUserPresence, getPresenceIndexKey } from '@/lib/presence';
import { rateLimit } from '@/lib/rate-limit';
import { redis } from '@/lib/redis';

const emailSchema = z.string().email();

export async function precheckLogin(email: string, turnstileToken: string) {
    // Better Auth performs the authoritative Siteverify check on /sign-in/email.
    // Do not consume this single-use token here: doing so makes sign-in fail.
    const parsedToken = z.string().trim().min(1).max(2048).safeParse(turnstileToken);
    if (!parsedToken.success) return { status: 'turnstile_failed' as const };

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return { status: 'error' };

    // Limit to 10 attempts per minute per email
    const rate = await rateLimit(`login_precheck:${email}`, { limit: 10, windowMs: 60000 });
    if (!rate.success) {
        return { status: 'rate_limited' };
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

        // 1. Check if user is actively online in Redis presence
        if (user.nik) {
            const isOnline = await redis.get(getPresenceIndexKey(user.nik));
            if (isOnline === '1') {
                return { status: 'active_session_exists' };
            }
        }

        // 2. Check if user has unexpired active sessions stored in Redis
        if (user.id) {
            const sessionsRaw = await redis.get(`active-sessions-${user.id}`);
            if (sessionsRaw) {
                try {
                    const sessions: Array<{ token: string; expiresAt?: number }> =
                        JSON.parse(sessionsRaw);
                    const now = Date.now();
                    const validSessions = sessions.filter(
                        (s) => !s.expiresAt || s.expiresAt > now
                    );
                    if (validSessions.length > 0) {
                        return { status: 'active_session_exists' };
                    }
                } catch {
                    // ignore JSON parse error
                }
            }

            // 3. Check if user has active sessions in database
            try {
                const activeSessionResult = await sql<{ id: string }>`
                    SELECT id FROM auth.session
                    WHERE "userId" = ${user.id} AND "expiresAt" > NOW()
                    LIMIT 1
                `.execute(db);
                if (activeSessionResult.rows.length > 0) {
                    return { status: 'active_session_exists' };
                }
            } catch (dbErr: any) {
                actionLogger.warn('Notice when querying DB session:', dbErr?.message || dbErr);
            }
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

        // 1. Clear presence from Redis so presence check passes cleanly
        if (user.nik) {
            await clearUserPresence(redis, user.nik);
        }

        // 2. Invalidate Better Auth sessions in Redis secondaryStorage
        if (user.id) {
            const sessionsKey = `active-sessions-${user.id}`;
            const sessionsRaw = await redis.get(sessionsKey);
            if (sessionsRaw) {
                try {
                    const sessions: Array<{ token: string }> = JSON.parse(sessionsRaw);
                    const tokens = sessions.map((s) => s.token).filter(Boolean);
                    if (tokens.length > 0) {
                        await redis.del(...tokens);
                    }
                } catch {
                    // ignore JSON error
                }
                await redis.del(sessionsKey);
            }

            // 3. Purge sessions from auth.session database table
            try {
                await sql`DELETE FROM auth.session WHERE "userId" = ${user.id}`.execute(db);
            } catch (dbErr: any) {
                actionLogger.warn('Notice when revoking DB session:', dbErr?.message || dbErr);
            }
        }

        return { success: true };
    } catch (error) {
        actionLogger.error(
            'Error revoking sessions:',
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: false };
    }
}

/**
 * Clear current user's presence upon explicit sign-out or idle timeout.
 */
export async function logoutUser() {
    try {
        const session = await getSessionUser();
        if (session.nik) {
            await clearUserPresence(redis, session.nik);
        }
    } catch {
        // Silently ignore if session is already invalid
    }
}
