import { LRUCache } from 'lru-cache';
import { cacheLogger } from '@/lib/logger';

export interface LruCacheOptions {
    /** Maximum number of items in the cache before eviction occurs. Default: 500 */
    max?: number;
    /** Time-to-live in milliseconds. Default: 5 minutes (300,000 ms) */
    ttlMs?: number;
}

/**
 * Factory to create typed, bounded LRU caches with automatic recency updates and eviction logging.
 */
export function createLruCache<V extends {} = any>(
    name: string,
    options?: LruCacheOptions
): LRUCache<string, V> {
    const max = options?.max ?? 500;
    const ttl = options?.ttlMs ?? 5 * 60 * 1000;

    return new LRUCache<string, V>({
        max,
        ttl,
        updateAgeOnGet: true,
        updateAgeOnHas: false,
        dispose: (_value, key, reason) => {
            if (reason === 'evict') {
                cacheLogger.debug(`[LRU:${name}] Evicted key: ${key} (max limit ${max} reached)`);
            } else if (reason === 'expire') {
                cacheLogger.debug(`[LRU:${name}] Expired key: ${key} (TTL ${ttl}ms elapsed)`);
            }
        },
    });
}

/**
 * L1 Cache for Master Reference Data:
 * - Technicians list (`hr.technicians`)
 * - Branches list (`inventory.mas_wh.branch`)
 * - Mitras list (`inventory.mitras`)
 * - Materials lookup (`inventory.materials`)
 * Max 500 items, TTL: 5 minutes.
 */
export const masterDataLru = createLruCache<any>('master-data', {
    max: 500,
    ttlMs: 5 * 60 * 1000,
});

/**
 * L1 Cache for Session Metadata & Permission Scoping:
 * Caches employee level, PIC mappings, and scoped warehouse IDs locally
 * for 30 seconds to eliminate repeated Redis roundtrips during rapid navigation.
 * Max 1,000 items, TTL: 30 seconds.
 */
export const sessionMetaLru = createLruCache<any>('session-meta', {
    max: 1000,
    ttlMs: 30 * 1000,
});

/**
 * L1 Cache for Other Stock (Google Sheets) Sync:
 * Bounded replacement for unbounded memory cache.
 * Max 20 items, TTL: 10 minutes.
 */
export const otherStockLru = createLruCache<any>('other-stock', {
    max: 20,
    ttlMs: 10 * 60 * 1000,
});

/**
 * Helper to fetch with L1 LRU caching: returns cached value or executes fetcher and populates cache.
 */
export async function getOrSetLru<T>(
    cache: LRUCache<string, any>,
    key: string,
    fetcher: () => Promise<T>,
    ttlMs?: number
): Promise<T> {
    const cached = cache.get(key) as T | undefined;
    if (cached !== undefined) {
        return cached;
    }
    const fresh = await fetcher();
    if (fresh !== undefined) {
        cache.set(key, fresh, { ttl: ttlMs });
    }
    return fresh;
}

/**
 * Invalidate master data cache entries (optionally filtered by key prefix, e.g. "hr:tech" or "mat:").
 */
export function invalidateMasterData(prefix?: string): void {
    if (!prefix) {
        masterDataLru.clear();
        return;
    }
    for (const key of masterDataLru.keys()) {
        if (key.startsWith(prefix)) {
            masterDataLru.delete(key);
        }
    }
}

/**
 * Invalidate session metadata cache for a specific NIK or all users.
 */
export function invalidateSessionMeta(nik?: string): void {
    if (!nik) {
        sessionMetaLru.clear();
        return;
    }
    sessionMetaLru.delete(`session:${nik}`);
}
