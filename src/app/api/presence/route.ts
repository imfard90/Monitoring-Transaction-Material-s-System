import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth-server';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { rateLimit } from '@/lib/security/rate-limit';

export async function POST() {
    try {
        const reqHeaders = await headers();

        // Single session resolution — getSessionUser queries role from hr.employees
        let sessionUser: Awaited<ReturnType<typeof getSessionUser>>;
        let sessionId: string;
        try {
            const [su, sessionData] = await Promise.all([
                getSessionUser(),
                auth.api.getSession({ headers: reqHeaders }),
            ]);
            sessionUser = su;
            if (!sessionData?.session) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            sessionId = sessionData.session.id;
        } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit by session ID instead of IP to avoid blocking users behind the same NAT/proxy
        const { success } = await rateLimit(`presence:${sessionId}`, 30, 60); // 30 req/min
        if (!success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        // Skip presence tracking for staff — they don't need concurrent session enforcement
        if (sessionUser.isStaff) {
            return NextResponse.json({ success: true, skipped: true });
        }

        const nik = sessionUser.nik;

        if (!nik) {
            return NextResponse.json({ error: 'Missing NIK' }, { status: 401 });
        }

        const storedSessionId = await redis.get(`presence:user:${nik}`);

        // If another session has claimed this user's presence, force logout old session
        if (storedSessionId && storedSessionId !== sessionId) {
            return NextResponse.json({ forceLogout: true }, { status: 401 });
        }

        // Refresh presence for this session (45 second TTL — allows one missed 30s heartbeat)
        await redis.set(`presence:user:${nik}`, sessionId, 'EX', 45);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error(
            '[presence] error:',
            error instanceof Error ? error : new Error(String(error))
        );
        // Internal error — do NOT force logout
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
