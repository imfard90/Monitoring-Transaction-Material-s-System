import { describe, expect, it, vi } from 'vitest';
import {
    createLruCache,
    getOrSetLru,
    invalidateMasterData,
    invalidateSessionMeta,
    masterDataLru,
    sessionMetaLru,
} from '@/lib/cache/lru-cache';

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
});

