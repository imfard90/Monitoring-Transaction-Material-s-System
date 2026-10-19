import { NextResponse } from 'next/server';
import { getLensaBrowserHealth } from '@/lib/lensa-scraper/lensa-scraper';

/**
 * GET /api/internal/lensa-browser
 *
 * Read-only health snapshot of the singleton Chromium browser.
 * No authentication required — internal network only (not exposed publicly).
 * Used by health checks, alerting, and operational dashboards.
 */
export async function GET() {
    const health = getLensaBrowserHealth();

    return NextResponse.json(
        {
            connected: health.connected,
            launchedAt: health.launchedAt,
            stale: health.stale,
        },
        {
            headers: {
                'Cache-Control': 'no-store',
            },
        }
    );
}
