import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth-server';
import { actionLogger } from '@/lib/logger';
import { getPresenceTtlSeconds, touchUserPresence } from '@/lib/presence';
import { rateLimit } from '@/lib/rate-limit';
import { redis } from '@/lib/redis';

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

        // Rate limit by session ID instead of IP to avoid blocking users behind same NAT/proxy
        const { success } = await rateLimit(`presence:${sessionId}`, 30, 60); // 30 req/min
        if (!success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const nik = sessionUser.nik;

        if (!nik) {
            return NextResponse.json({ error: 'Missing NIK' }, { status: 401 });
        }

        // Touch presence for all roles (including Staff)
        const ttlSeconds = getPresenceTtlSeconds();
        await touchUserPresence(redis, nik, sessionId, ttlSeconds);

        return NextResponse.json({ success: true });
    } catch (error) {
        actionLogger.error(
            '[presence] error:',
            error instanceof Error ? error : new Error(String(error))
        );
        // Internal error — do NOT force logout
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
