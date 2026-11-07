import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelectFrom = vi.fn();
const mockRedisPing = vi.fn();
const mockIsWorkerActive = vi.fn();
const mockGetWorkerBrowserSnapshot = vi.fn();

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: (...args: unknown[]) => mockSelectFrom(...args),
    },
}));

vi.mock('@/lib/redis', () => ({
    redis: {
        ping: () => mockRedisPing(),
    },
}));

vi.mock('@/lib/workers/worker-client', () => ({
    isWorkerActive: () => mockIsWorkerActive(),
    getWorkerBrowserSnapshot: () => mockGetWorkerBrowserSnapshot(),
}));

/**
 * `/api/health` regression tests.
 *
 * The incident: the endpoint reported `NO_ENDPOINT` / a permanent 503 because it
 * read an in-process Chromium handle that only exists in the `mtms-worker`
 * process. The browser state must now come from the worker snapshot in Redis,
 * and an idle browser (worker up, no scrape running) must not degrade health.
 */
describe('GET /api/health', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        mockSelectFrom.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([{ id: '1' }]),
        });
        mockRedisPing.mockResolvedValue('PONG');
        mockIsWorkerActive.mockResolvedValue(true);
        mockGetWorkerBrowserSnapshot.mockResolvedValue(null);
    });

    it('returns 200 with status ok when every dependency is reachable', async () => {
        const { GET } = await import('@/app/api/health/route');

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe('ok');
        expect(body.checks.database).toBe(true);
        expect(body.checks.redis).toBe(true);
        expect(body.checks.worker).toBe(true);
    });

    it('treats an idle browser as healthy', async () => {
        // No snapshot → the worker never launched a browser (normal between scrapes).
        mockGetWorkerBrowserSnapshot.mockResolvedValue(null);

        const { GET } = await import('@/app/api/health/route');

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.checks.browser.state).toBe('idle');
    });

    it('reports the worker browser snapshot when a browser is running', async () => {
        mockGetWorkerBrowserSnapshot.mockResolvedValue({
            pid: 4242,
            contexts: 2,
            connected: true,
            updatedAt: Date.now(),
        });

        const { GET } = await import('@/app/api/health/route');

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.checks.browser).toEqual({
            state: 'alive',
            pid: 4242,
            contexts: 2,
        });
    });

    it('returns 503 when the database is unreachable', async () => {
        mockSelectFrom.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            execute: vi.fn().mockRejectedValue(new Error('db down')),
        });

        const { GET } = await import('@/app/api/health/route');

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body.status).toBe('degraded');
    });

    it('returns 503 when the worker is offline', async () => {
        mockIsWorkerActive.mockResolvedValue(false);

        const { GET } = await import('@/app/api/health/route');

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body.checks.worker).toBe(false);
        expect(body.checks.browser.state).toBe('down');
    });
});
