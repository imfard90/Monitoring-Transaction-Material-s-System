import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
    redis: {},
}));

import {
    createLruCache,
    getOrSetLru,
    invalidateLiveStockCache,
    invalidateMasterData,
    invalidateNotificationCache,
    invalidateSessionMeta,
    liveStockLru,
    masterDataLru,
    notificationLru,
    sessionMetaLru,
} from '@/lib/cache/lru-cache';
import { withRateLimit } from '@/lib/fp/hofs';
import { createInventoryRepository } from '@/lib/repositories/inventory.repository';

describe('LRU Cache Core Module', () => {
    it('sets and retrieves items correctly', () => {
        const cache = createLruCache<string>('test-cache', { max: 3, ttlMs: 10000 });
        cache.set('key1', 'val1');
        cache.set('key2', 'val2');

        expect(cache.get('key1')).toBe('val1');
        expect(cache.get('key2')).toBe('val2');
        expect(cache.get('key3')).toBeUndefined();
    });

    it('evicts the least recently used item when max capacity is reached', () => {
        const cache = createLruCache<string>('test-evict', { max: 3, ttlMs: 10000 });
        cache.set('a', '1');
        cache.set('b', '2');
        cache.set('c', '3');

        // Reading 'a' makes it Most Recently Used: order becomes b, c, a
        expect(cache.get('a')).toBe('1');

        // Adding 'd' should evict 'b' (least recently used)
        cache.set('d', '4');

        expect(cache.has('b')).toBe(false);
        expect(cache.get('a')).toBe('1');
        expect(cache.get('c')).toBe('3');
        expect(cache.get('d')).toBe('4');
    });

    it('getOrSetLru returns cached value without calling fetcher twice', async () => {
        const cache = createLruCache<string>('test-get-set', { max: 5 });
        const fetcher = vi.fn().mockResolvedValue('computed_result');

        const res1 = await getOrSetLru(cache as any, 'test_key', fetcher);
        expect(res1).toBe('computed_result');
        expect(fetcher).toHaveBeenCalledTimes(1);

        // Second call should return from cache directly
        const res2 = await getOrSetLru(cache as any, 'test_key', fetcher);
        expect(res2).toBe('computed_result');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('invalidateMasterData removes specific prefixes or all keys', () => {
        masterDataLru.set('hr:tech:all', ['tech1', 'tech2']);
        masterDataLru.set('hr:branches', ['branch1']);
        masterDataLru.set('mat:all', ['mat1']);

        // Invalidate only 'hr:' prefix
        invalidateMasterData('hr:');
        expect(masterDataLru.has('hr:tech:all')).toBe(false);
        expect(masterDataLru.has('hr:branches')).toBe(false);
        expect(masterDataLru.has('mat:all')).toBe(true);

        // Invalidate all
        invalidateMasterData();
        expect(masterDataLru.has('mat:all')).toBe(false);
    });

    it('invalidateSessionMeta clears specific user or all users', () => {
        sessionMetaLru.set('session:12345', { role: 'admin' });
        sessionMetaLru.set('session:67890', { role: 'staff' });

        invalidateSessionMeta('12345');
        expect(sessionMetaLru.has('session:12345')).toBe(false);
        expect(sessionMetaLru.has('session:67890')).toBe(true);

        invalidateSessionMeta();
        expect(sessionMetaLru.has('session:67890')).toBe(false);
    });

    it('invalidateNotificationCache clears specific user or all users', () => {
        notificationLru.set('notif:12345:1_2', { total: 5 });
        notificationLru.set('notif:67890:all', { total: 2 });

        invalidateNotificationCache('12345');
        expect(notificationLru.has('notif:12345:1_2')).toBe(false);
        expect(notificationLru.has('notif:67890:all')).toBe(true);

        invalidateNotificationCache();
        expect(notificationLru.has('notif:67890:all')).toBe(false);
    });

    it('invalidateLiveStockCache clears live stock snapshot', () => {
        liveStockLru.set('live-stock:snapshot', { items: [] });
        expect(liveStockLru.has('live-stock:snapshot')).toBe(true);

        invalidateLiveStockCache();
        expect(liveStockLru.has('live-stock:snapshot')).toBe(false);
    });

    it('withRateLimit bounds requests and respects limits via LRU cache', async () => {
        const handler = vi.fn().mockImplementation(async (x: number) => x * 2);
        const rateLimited = withRateLimit('test_user', 2, 1000, handler);

        // 1st request: OK
        await expect(rateLimited(1)).resolves.toBe(2);
        // 2nd request: OK
        await expect(rateLimited(2)).resolves.toBe(4);
        // 3rd request: Exceeds limit
        await expect(rateLimited(3)).rejects.toThrow('Rate limit exceeded for test_user');
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('caches listWarehouses and filters in memory for getWarehouses', async () => {
        masterDataLru.delete('wh:all');
        const mockExecute = vi.fn().mockResolvedValue([
            { id: 1, name: 'WH Alpha', branch: 'SURABAYA' },
            { id: 2, name: 'WH Beta', branch: 'SIDOARJO' },
            { id: 3, name: 'WH Gamma', branch: 'GRESIK' },
        ]);
        const mockDb: any = {
            selectFrom: vi.fn().mockReturnValue({
                selectAll: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockReturnValue({
                        execute: mockExecute,
                    }),
                }),
            }),
        };

        const repo = createInventoryRepository(mockDb);

        // 1st call: queries DB
        const whsAll = await repo.listWarehouses();
        expect(whsAll).toHaveLength(3);
        expect(mockExecute).toHaveBeenCalledTimes(1);

        // 2nd call: cached, no additional DB query
        const whsAllCached = await repo.listWarehouses();
        expect(whsAllCached).toHaveLength(3);
        expect(mockExecute).toHaveBeenCalledTimes(1);

        // getWarehouses with specific IDs: filters in memory, no DB query!
        const filtered = await repo.getWarehouses([1, 3]);
        expect(filtered).toHaveLength(2);
        expect(filtered.map((w) => w.id)).toEqual([1, 3]);
        expect(mockExecute).toHaveBeenCalledTimes(1);

        // getWarehouses with empty IDs: returns empty immediately
        const empty = await repo.getWarehouses([]);
        expect(empty).toEqual([]);
        expect(mockExecute).toHaveBeenCalledTimes(1);

        // isInternalWarehouse uses cache as well
        const isInternal = await repo.isInternalWarehouse(1, 'SURABAYA');
        expect(isInternal).toBe(true);
        const isExternal = await repo.isInternalWarehouse(2, 'SURABAYA');
        expect(isExternal).toBe(false);
        expect(mockExecute).toHaveBeenCalledTimes(1);
    });
});
