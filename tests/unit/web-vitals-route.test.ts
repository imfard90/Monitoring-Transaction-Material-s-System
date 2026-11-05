import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
    redis: {},
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 59, limit: 60 }),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
}));

import { POST } from '@/app/api/telemetry/web-vitals/route';
import { actionLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

describe('/api/telemetry/web-vitals Route Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 204 and logs poor ratings with actionLogger.warn', async () => {
        const payload = {
            id: 'v1-123',
            name: 'LCP',
            value: 4500.5,
            rating: 'poor',
            navigationType: 'navigate',
        };

        const req = new Request('http://localhost:3000/api/telemetry/web-vitals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const res = await POST(req);
        expect(res.status).toBe(204);
        expect(actionLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[WebVitals:Poor] LCP = 4500.50 (poor, nav: navigate)')
        );
    });

    it('returns 204 and logs good ratings with actionLogger.debug', async () => {
        const payload = {
            id: 'v1-124',
            name: 'FCP',
            value: 800.2,
            rating: 'good',
        };

        const req = new Request('http://localhost:3000/api/telemetry/web-vitals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const res = await POST(req);
        expect(res.status).toBe(204);
        expect(actionLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('[WebVitals:Good] FCP = 800.20')
        );
    });

    it('returns 400 when metric name or payload is invalid', async () => {
        const payload = {
            name: 'INVALID_METRIC_NAME',
            value: 100,
        };

        const req = new Request('http://localhost:3000/api/telemetry/web-vitals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it('returns 204 without processing when rate limit is exceeded', async () => {
        vi.mocked(rateLimit).mockResolvedValueOnce({ success: false, remaining: 0, limit: 60 });

        const req = new Request('http://localhost:3000/api/telemetry/web-vitals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'FCP', value: 500 }),
        });

        const res = await POST(req);
        expect(res.status).toBe(204);
        expect(actionLogger.debug).not.toHaveBeenCalled();
    });

    it('logs as debug when NODE_ENV is development even if rating is poor', async () => {
        const originalEnv = process.env.NODE_ENV;
        try {
            (process.env as any).NODE_ENV = 'development';
            const req = new Request('http://localhost:3000/api/telemetry/web-vitals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'LCP', value: 9000, rating: 'poor' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(204);
            expect(actionLogger.warn).not.toHaveBeenCalled();
            expect(actionLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('[WebVitals:Dev] LCP = 9000.00 (poor, nav: navigate)')
            );
        } finally {
            (process.env as any).NODE_ENV = originalEnv;
        }
    });
});
