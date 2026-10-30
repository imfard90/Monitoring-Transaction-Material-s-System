import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireLock, withLock } from '@/lib/redis-lock';

vi.mock('@/lib/redis', () => ({
    redis: {
        set: vi.fn(),
        eval: vi.fn(),
    },
}));

import { redis } from '@/lib/redis';

describe('Safe Distributed Redis Lock', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('acquireLock', () => {
        it('returns LockHandle when lock is successfully acquired', async () => {
            vi.mocked(redis.set).mockResolvedValue('OK');

            const lock = await acquireLock('lock:test_resource', 60);
            expect(lock).not.toBeNull();
            expect(lock?.key).toBe('lock:test_resource');
            expect(typeof lock?.token).toBe('string');
            expect(lock?.token.length).toBeGreaterThan(10);
            expect(redis.set).toHaveBeenCalledWith(
                'lock:test_resource',
                lock?.token,
                'EX',
                60,
                'NX'
            );
        });

        it('returns null when lock is already acquired by another worker', async () => {
            vi.mocked(redis.set).mockResolvedValue(null as any);

            const lock = await acquireLock('lock:busy_resource', 60);
            expect(lock).toBeNull();
        });

        it('returns null when Redis connection throws an error', async () => {
            vi.mocked(redis.set).mockRejectedValue(new Error('Connection lost'));

            const lock = await acquireLock('lock:err_resource', 60);
            expect(lock).toBeNull();
        });
    });

    describe('release() via Lua Script', () => {
        it('releases lock atomically when token matches owner', async () => {
            vi.mocked(redis.set).mockResolvedValue('OK');
            vi.mocked(redis.eval).mockResolvedValue(1);

            const lock = await acquireLock('lock:owner_match', 60);
            expect(lock).not.toBeNull();

            const released = await lock?.release();
            expect(released).toBe(true);
            expect(redis.eval).toHaveBeenCalledWith(
                expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'),
                1,
                'lock:owner_match',
                lock?.token
            );
        });

        it('returns false and does not delete lock if token does not match (another worker held lock)', async () => {
            vi.mocked(redis.set).mockResolvedValue('OK');
            vi.mocked(redis.eval).mockResolvedValue(0);

            const lock = await acquireLock('lock:owner_mismatch', 60);
            expect(lock).not.toBeNull();

            const released = await lock?.release();
            expect(released).toBe(false);
        });
    });

    describe('withLock helper', () => {
        it('executes callback and releases lock in finally block', async () => {
            vi.mocked(redis.set).mockResolvedValue('OK');
            vi.mocked(redis.eval).mockResolvedValue(1);

            const mockTask = vi.fn().mockResolvedValue('task_done');
            const res = await withLock('lock:task', 30, mockTask);

            expect(res.acquired).toBe(true);
            if (res.acquired) {
                expect(res.result).toBe('task_done');
            }
            expect(mockTask).toHaveBeenCalled();
            expect(redis.eval).toHaveBeenCalled();
        });

        it('returns acquired: false without executing task if lock is busy', async () => {
            vi.mocked(redis.set).mockResolvedValue(null as any);

            const mockTask = vi.fn();
            const res = await withLock('lock:busy_task', 30, mockTask);

            expect(res.acquired).toBe(false);
            expect(mockTask).not.toHaveBeenCalled();
        });
    });
});
