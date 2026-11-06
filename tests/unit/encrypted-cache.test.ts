import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedisStore = new Map<string, string>();

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn().mockImplementation(async (key: string) => mockRedisStore.get(key) ?? null),
        set: vi.fn().mockImplementation(async (key: string, val: string) => {
            mockRedisStore.set(key, val);
            return 'OK';
        }),
        del: vi.fn().mockImplementation(async (...keys: string[]) => {
            let count = 0;
            for (const k of keys) {
                if (mockRedisStore.delete(k)) count++;
            }
            return count;
        }),
        scan: vi
            .fn()
            .mockImplementation(async (_cursor: string) => [
                '0',
                Array.from(mockRedisStore.keys()),
            ]),
    },
}));

process.env.CACHE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

import { EncryptedCache } from '@/lib/cache/encryptedCache';
import { redis } from '@/lib/redis';

describe('EncryptedCache Two-Tier L1 LRU + L2 Redis', () => {
    let cache: EncryptedCache;

    beforeEach(() => {
        mockRedisStore.clear();
        vi.clearAllMocks();
        cache = new EncryptedCache(30);
    });

    it('sets and gets general cache, using L1 on repeated reads without Redis calls', async () => {
        const payload = { sales: 1250000, items: ['cable', 'ont'] };

        // 1. Set data
        await cache.setGeneral('dashboard', payload, 'kpi_test', 30);
        expect(redis.set).toHaveBeenCalledTimes(1);

        // 2. First getGeneral: hit from L1 LRU memory directly
        const hit1 = await cache.getGeneral<typeof payload>('dashboard', 'kpi_test');
        expect(hit1).toEqual(payload);
        // Redis.get should NOT be called because it was cached in L1 memory during setGeneral!
        expect(redis.get).toHaveBeenCalledTimes(0);

        // 3. Second getGeneral: still in L1 memory
        const hit2 = await cache.getGeneral<typeof payload>('dashboard', 'kpi_test');
        expect(hit2).toEqual(payload);
        expect(redis.get).toHaveBeenCalledTimes(0);
    });

    it('falls back to L2 Redis on L1 miss and populates L1 for subsequent calls', async () => {
        const payload = { test: 'from_redis' };

        // Save to cache via cache1
        const cache1 = new EncryptedCache(30);
        await cache1.setGeneral('dashboard', payload, 'isolated_key', 30);

        // cache2 has an empty L1 LRU memory
        const cache2 = new EncryptedCache(30);

        // 1st get on cache2: misses L1, reads Redis L2, decrypts and populates L1
        const fromL2 = await cache2.getGeneral<typeof payload>('dashboard', 'isolated_key');
        expect(fromL2).toEqual(payload);
        expect(redis.get).toHaveBeenCalledTimes(1);

        // 2nd get on cache2: now hits L1, no second Redis call
        const fromL1 = await cache2.getGeneral<typeof payload>('dashboard', 'isolated_key');
        expect(fromL1).toEqual(payload);
        expect(redis.get).toHaveBeenCalledTimes(1);
    });

    it('invalidates both L1 memory and L2 Redis on invalidateGeneral', async () => {
        await cache.setGeneral('dashboard', { num: 1 }, 'key1', 30);
        await cache.setGeneral('dashboard', { num: 2 }, 'key2', 30);

        await cache.invalidateGeneral('dashboard');

        // Verify L1 is purged
        const val1 = await cache.getGeneral('dashboard', 'key1');
        expect(val1).toBeNull();
    });
});
