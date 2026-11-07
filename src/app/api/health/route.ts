import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { redis } from '@/lib/redis';
import {
    getWorkerBrowserSnapshot,
    isWorkerActive,
    type WorkerBrowserSnapshot,
} from '@/lib/workers/worker-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring, load balancers, and alerting.
 *
 * The Chromium browser used for Lensa scraping lives in the `mtms-worker`
 * process, not in the `mtms-web` process, so its state is read from the Redis
 * snapshot published by the worker rather than inspected in-process.
 *
 * - 200 `status: "ok"`       → database, Redis, and the worker are all reachable.
 * - 503 `status: "degraded"` → at least one critical dependency is down.
 *
 * No authentication required — internal network only (not exposed publicly).
 */
export async function GET() {
    const checks = {
        database: false,
        redis: false,
        worker: false,
        browser: {
            /** 'alive' = running, 'idle' = worker up but no browser launched yet. */
            state: 'idle' as 'alive' | 'idle' | 'down',
            pid: null as number | null,
            contexts: 0,
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
        const snapshot: WorkerBrowserSnapshot | null = await getWorkerBrowserSnapshot();
        if (snapshot) {
            checks.browser = {
                state: snapshot.connected ? 'alive' : 'down',
                pid: snapshot.pid,
                contexts: snapshot.contexts,
            };
        } else {
            // No snapshot: either the worker is idle (never launched a browser)
            // or the worker is down. The worker heartbeat disambiguates.
            checks.browser.state = checks.worker ? 'idle' : 'down';
        }
    } catch {
        // Browser health unavailable
    }

    // An idle browser is a normal state (the worker only launches Chromium when a
    // scrape runs), so it must not degrade the overall health. Only a browser that
    // is running but disconnected is a real fault.
    const browserHealthy = checks.browser.state !== 'down';
    const allHealthy = checks.database && checks.redis && checks.worker && browserHealthy;

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
