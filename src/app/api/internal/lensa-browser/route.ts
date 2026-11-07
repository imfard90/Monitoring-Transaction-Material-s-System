import { NextResponse } from 'next/server';
import { getWorkerBrowserSnapshot } from '@/lib/workers/worker-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/internal/lensa-browser
 *
 * Read-only health snapshot of the singleton Chromium browser used for Lensa
 * scraping. The browser runs inside the `mtms-worker` process, so the state is
 * read from the Redis snapshot published by that worker.
 *
 * No authentication required — internal network only (not exposed publicly).
 * Used by health checks, alerting, and operational dashboards.
 */
export async function GET() {
    const snapshot = await getWorkerBrowserSnapshot();

    return NextResponse.json(
        {
            state: snapshot ? (snapshot.connected ? 'alive' : 'down') : 'idle',
            pid: snapshot?.pid ?? null,
            contexts: snapshot?.contexts ?? 0,
            updatedAt: snapshot?.updatedAt ?? null,
        },
        {
            headers: {
                'Cache-Control': 'no-store',
            },
        }
    );
}
