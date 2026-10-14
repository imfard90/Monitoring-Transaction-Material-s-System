import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redis } from '@/lib/redis';
import { checkAndConsumeApiRateLimit } from '@/lib/security/api-rate-limit';

vi.mock('@/lib/redis', () => ({
    redis: {
        multi: vi.fn(),
    },
}));

describe('API User Rate Limiter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('allows the first request within 5 minutes', async () => {
        const mockPipeline = {
            incr: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            ttl: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([
                [null, 1], // count
                [null, 1], // expire
                [null, 300], // ttl
            ]),
        };

        vi.mocked(redis.multi).mockReturnValue(mockPipeline as any);

        const result = await checkAndConsumeApiRateLimit('user-123');

        expect(result.allowed).toBe(true);
        expect(result.retryAfterSeconds).toBe(0);
        expect(result.retryAt).toBeNull();
        expect(mockPipeline.incr).toHaveBeenCalledWith('ratelimit:api:user:user-123');
        expect(mockPipeline.expire).toHaveBeenCalledWith('ratelimit:api:user:user-123', 300, 'NX');
    });

    it('blocks subsequent requests within the 5 minute window and returns retry details', async () => {
        const mockPipeline = {
            incr: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            ttl: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([
                [null, 2], // count = 2 (> 1)
                [null, 0], // expire not set (already exists)
                [null, 240], // 240 seconds left
            ]),
        };

        vi.mocked(redis.multi).mockReturnValue(mockPipeline as any);

        const result = await checkAndConsumeApiRateLimit('user-123');

        expect(result.allowed).toBe(false);
        expect(result.retryAfterSeconds).toBe(240);
        expect(result.retryAt).toBeTruthy();
        expect(new Date(result.retryAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it('fails closed if Redis throws an unexpected error', async () => {
        vi.mocked(redis.multi).mockImplementation(() => {
            throw new Error('Redis connection failure');
        });

        const result = await checkAndConsumeApiRateLimit('user-123');

        expect(result.allowed).toBe(false);
        expect(result.retryAfterSeconds).toBe(300);
        expect(result.retryAt).toBeTruthy();
    });

    it('fails closed if the Redis pipeline returns no result', async () => {
        const mockPipeline = {
            incr: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            ttl: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue(null),
        };
        vi.mocked(redis.multi).mockReturnValue(mockPipeline as any);

        const result = await checkAndConsumeApiRateLimit('user-123');

        expect(result.allowed).toBe(false);
        expect(result.retryAfterSeconds).toBe(300);
        expect(result.retryAt).toBeTruthy();
    });

    it('fails closed if the Redis increment command returns an error', async () => {
        const mockPipeline = {
            incr: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            ttl: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([
                [new Error('increment failed'), null],
                [null, 1],
                [null, 300],
            ]),
        };
        vi.mocked(redis.multi).mockReturnValue(mockPipeline as any);

        const result = await checkAndConsumeApiRateLimit('user-123');

        expect(result.allowed).toBe(false);
        expect(result.retryAfterSeconds).toBe(300);
        expect(result.retryAt).toBeTruthy();
    });
});
