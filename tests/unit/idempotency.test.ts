import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@/lib/errors';
import {
    checkAndStoreIdempotency,
    checkIdempotency,
    deleteIdempotencyKey,
    storeIdempotencyResult,
} from '@/lib/security/idempotency';

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
    },
}));

import { redis } from '@/lib/redis';

describe('Idempotency Module (Atomic & Resilient)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkIdempotency', () => {
        it('returns isDuplicate: false when key does not exist', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);

            const res = await checkIdempotency('test-key-1');
            expect(res.isDuplicate).toBe(false);
            expect(res.cachedResult).toBeNull();
        });

        it('returns cached result when key already completed', async () => {
            vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ success: true, id: 101 }));

            const res = await checkIdempotency<{ success: boolean; id: number }>('test-key-2');
            expect(res.isDuplicate).toBe(true);
            expect(res.cachedResult).toEqual({ success: true, id: 101 });
        });

        it('returns isDuplicate: true and null result if status is PENDING', async () => {
            vi.mocked(redis.get).mockResolvedValue('PENDING');

            const res = await checkIdempotency('test-key-3');
            expect(res.isDuplicate).toBe(true);
            expect(res.cachedResult).toBeNull();
        });

        it('falls back gracefully to isDuplicate: false if Redis throws an error', async () => {
            vi.mocked(redis.get).mockRejectedValue(new Error('Connection lost'));

            const res = await checkIdempotency('test-key-4');
            expect(res.isDuplicate).toBe(false);
            expect(res.cachedResult).toBeNull();
        });
    });

    describe('storeIdempotencyResult', () => {
        it('stores stringified JSON with expiration in Redis', async () => {
            vi.mocked(redis.set).mockResolvedValue('OK');

            await storeIdempotencyResult('test-key-5', { status: 'DONE' });
            expect(redis.set).toHaveBeenCalledWith(
                'idem:inventory:test-key-5',
                JSON.stringify({ status: 'DONE' }),
                'EX',
                300
            );
        });
    });

    describe('checkAndStoreIdempotency', () => {
        it('executes operation and caches result when key is newly reserved (SET NX)', async () => {
            vi.mocked(redis.set).mockResolvedValue('OK');

            const mockOp = vi.fn().mockResolvedValue({ id_trx: 'TRX-001' });
            const { result, isDuplicate } = await checkAndStoreIdempotency(
                'new-trx-1',
                { amount: 10 },
                mockOp
            );

            expect(mockOp).toHaveBeenCalledWith({ amount: 10 });
            expect(result).toEqual({ id_trx: 'TRX-001' });
            expect(isDuplicate).toBe(false);
            expect(redis.set).toHaveBeenCalledWith(
                'idem:inventory:new-trx-1',
                'PENDING',
                'EX',
                300,
                'NX'
            );
            expect(redis.set).toHaveBeenCalledWith(
                'idem:inventory:new-trx-1',
                JSON.stringify({ id_trx: 'TRX-001' }),
                'EX',
                300
            );
        });

        it('returns cached result without re-executing operation on duplicate request', async () => {
            // SET NX returns null because key exists
            vi.mocked(redis.set).mockResolvedValue(null as any);
            vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ id_trx: 'TRX-001' }));

            const mockOp = vi.fn();
            const { result, isDuplicate } = await checkAndStoreIdempotency(
                'new-trx-1',
                { amount: 10 },
                mockOp
            );

            expect(mockOp).not.toHaveBeenCalled();
            expect(isDuplicate).toBe(true);
            expect(result).toEqual({ id_trx: 'TRX-001' });
        });

        it('throws ConflictError if duplicate request arrives while operation is PENDING', async () => {
            vi.mocked(redis.set).mockResolvedValue(null as any);
            vi.mocked(redis.get).mockResolvedValue('PENDING');

            const mockOp = vi.fn();
            await expect(checkAndStoreIdempotency('pending-key', {}, mockOp)).rejects.toThrow(
                ConflictError
            );

            expect(mockOp).not.toHaveBeenCalled();
        });

        it('deletes pending key on operation failure and re-throws error so user can retry', async () => {
            vi.mocked(redis.set).mockResolvedValue('OK');
            vi.mocked(redis.del).mockResolvedValue(1);

            const mockOp = vi.fn().mockRejectedValue(new Error('Database deadlock'));

            await expect(checkAndStoreIdempotency('fail-key', {}, mockOp)).rejects.toThrow(
                'Database deadlock'
            );

            expect(redis.del).toHaveBeenCalledWith('idem:inventory:fail-key');
        });

        it('executes operation gracefully even if Redis is down on initial check', async () => {
            vi.mocked(redis.set).mockRejectedValueOnce(new Error('Redis timeout'));

            const mockOp = vi.fn().mockResolvedValue({ status: 'ok_without_redis' });
            const { result, isDuplicate } = await checkAndStoreIdempotency(
                'redis-down-key',
                {},
                mockOp
            );

            expect(mockOp).toHaveBeenCalled();
            expect(result).toEqual({ status: 'ok_without_redis' });
            expect(isDuplicate).toBe(false);
        });
    });

    describe('deleteIdempotencyKey', () => {
        it('calls redis.del with matching prefix', async () => {
            vi.mocked(redis.del).mockResolvedValue(1);
            await deleteIdempotencyKey('to-delete');
            expect(redis.del).toHaveBeenCalledWith('idem:inventory:to-delete');
        });
    });
});
