import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redis } from '@/lib/redis';
import {
    WORKER_HEARTBEAT_KEY,
    WORKER_QUEUE_KEY,
    dispatchWorkerJob,
    isWorkerActive,
} from '@/lib/workers/worker-client';

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        lpush: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Worker Client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isWorkerActive', () => {
        it('returns true when heartbeat key exists in Redis', async () => {
            vi.mocked(redis.get).mockResolvedValueOnce(
                JSON.stringify({ pid: 1234, timestamp: Date.now() })
            );

            const active = await isWorkerActive();
            expect(active).toBe(true);
            expect(redis.get).toHaveBeenCalledWith(WORKER_HEARTBEAT_KEY);
        });

        it('returns false when heartbeat key is null', async () => {
            vi.mocked(redis.get).mockResolvedValueOnce(null);

            const active = await isWorkerActive();
            expect(active).toBe(false);
            expect(redis.get).toHaveBeenCalledWith(WORKER_HEARTBEAT_KEY);
        });

        it('returns false and logs warning when redis throws an error', async () => {
            vi.mocked(redis.get).mockRejectedValueOnce(new Error('Redis connection down'));

            const active = await isWorkerActive();
            expect(active).toBe(false);
        });
    });

    describe('dispatchWorkerJob', () => {
        it('successfully pushes job to queue', async () => {
            vi.mocked(redis.lpush).mockResolvedValueOnce(1);

            const success = await dispatchWorkerJob({
                id: 'job_test_1',
                type: 'scrape:out-lensa',
                perpage: 20,
                createdAt: Date.now(),
            });

            expect(success).toBe(true);
            expect(redis.lpush).toHaveBeenCalledWith(
                WORKER_QUEUE_KEY,
                expect.stringContaining('job_test_1')
            );
        });

        it('returns false when redis lpush fails', async () => {
            vi.mocked(redis.lpush).mockRejectedValueOnce(new Error('Redis full'));

            const success = await dispatchWorkerJob({
                id: 'job_test_2',
                type: 'scrape:wo-lensa',
                createdAt: Date.now(),
            });

            expect(success).toBe(false);
        });
    });
});
