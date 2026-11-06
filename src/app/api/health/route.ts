import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { getLensaBrowserHealth } from '@/lib/lensa-scraper/lensa-scraper';
import { redis } from '@/lib/redis';
import { isWorkerActive } from '@/lib/workers/worker-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring, load balancers, and alerting.
 * Returns 200 if all critical services are healthy, 503 if any are degraded.
 * No authentication required — internal network only (not exposed publicly).
 */
export async function GET() {
    const checks = {
        database: false,
        redis: false,
        worker: false,
        browser: {
            connected: false,
            stale: true,
        },
    };

    try {
        await db.selectFrom('auth.user').select('id').limit(1).execute();
        checks.database = true;
    } catch {
        // DB unavailable
    }

    try {
        await redis.ping();
        checks.redis = true;
    } catch {
        // Redis unavailable
    }

    try {
        checks.worker = await isWorkerActive();
    } catch {
        // Worker check failed
    }

    try {
        checks.browser = getLensaBrowserHealth();
    } catch {
        // Browser health unavailable
    }

    const allHealthy =
        checks.database &&
        checks.redis &&
        checks.worker &&
        checks.browser.connected &&
        !checks.browser.stale;

    return NextResponse.json(
        {
            status: allHealthy ? 'ok' : 'degraded',
            checks,
            timestamp: new Date().toISOString(),
        },
        {
            status: allHealthy ? 200 : 503,
            headers: {
                'Cache-Control': 'no-store',
            },
        }
    );
}
