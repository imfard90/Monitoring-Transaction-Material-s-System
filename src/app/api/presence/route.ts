import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionUser } from '@/lib/auth-server';
import { logger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { rateLimit } from '@/lib/rate-limit';

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

    // Skip presence tracking for staff — they don't need concurrent session enforcement
    if (sessionUser.isStaff) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const nik = sessionUser.nik;

    if (!nik) {
      return NextResponse.json({ error: 'Missing NIK' }, { status: 401 });
    }

    // ── Atomic presence claim using SET NX EX (P3 fix) ──────────────────────
    // Eliminates the get→check→set race condition (TOCTOU) where two concurrent
    // heartbeats from different sessions could both pass the storedSessionId
    // check and overwrite each other.
    //
    // Flow:
    //  1. GET current owner (if any). If it's a different session → force logout.
    //  2. SET key sessionId EX 45 NX — only sets if key doesn't exist (first claim).
    //  3. If NX returned null (key existed), re-verify owner matches our session.
    const redisKey = `presence:user:${nik}`;
    const storedSessionId = await redis.get(redisKey);

    if (storedSessionId && storedSessionId !== sessionId) {
      // Another session already claims presence → force logout this one
      return NextResponse.json({ forceLogout: true }, { status: 401 });
    }

    if (storedSessionId === sessionId) {
      // Same session refreshing — extend TTL atomically
      await redis.set(redisKey, sessionId, 'EX', 45);
    } else {
      // No key exists (or expired) — claim atomically with NX
      const claimed = await redis.set(redisKey, sessionId, 'EX', 45, 'NX');
      if (claimed === null) {
        // Race lost — another session claimed between our GET and SET NX
        const currentOwner = await redis.get(redisKey);
        if (currentOwner && currentOwner !== sessionId) {
          return NextResponse.json({ forceLogout: true }, { status: 401 });
        }
      }
    }

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
