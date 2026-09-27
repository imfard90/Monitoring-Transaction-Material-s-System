import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redis } from '@/lib/redis';

export async function POST() {
    try {
        const sessionData = await auth.api.getSession({
            headers: await headers(),
        });

        // No session = not logged in, return 401 WITHOUT forceLogout flag
        if (!sessionData?.session || !sessionData?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const nik = (sessionData.user as any).nik as string;
        const currentSessionId = sessionData.session.id;

        if (!nik) {
            return NextResponse.json({ error: 'Missing NIK' }, { status: 401 });
        }

        const storedSessionId = await redis.get(`presence:user:${nik}`);

        // If another session has claimed this user's presence, force logout old session
        if (storedSessionId && storedSessionId !== currentSessionId) {
            return NextResponse.json({ forceLogout: true }, { status: 401 });
        }

        // Refresh presence for this session (45 second TTL — allows one missed 30s heartbeat)
        await redis.set(`presence:user:${nik}`, currentSessionId, 'EX', 45);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[presence] error:', error);
        // Internal error — do NOT force logout
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
