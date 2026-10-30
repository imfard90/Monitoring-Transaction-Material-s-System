import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import { dbLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

/**
 * Skrip Lua atomik untuk melepaskan distributed lock:
 * Hanya menghapus kunci jika nilainya sama persis dengan token kepemilikan yang terdaftar.
 * Mencegah worker melepaskan lock milik worker lain saat waktu eksekusi melebihi TTL.
 */
const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

export interface LockHandle {
    key: string;
    token: string;
    release: () => Promise<boolean>;
}

/**
 * Mengambil distributed lock dengan token acak unik (UUID).
 * @param lockKey Nama kunci lock di Redis
 * @param ttlSeconds Masa aktif kunci dalam detik (auto-expire)
 * @param redisClient Instance Redis (opsional, default: singleton @/lib/redis)
 * @returns LockHandle jika berhasil diambil, atau null jika sedang dipakai instance lain
 */
export async function acquireLock(
    lockKey: string,
    ttlSeconds: number,
    redisClient: Redis = redis
): Promise<LockHandle | null> {
    try {
        const token = randomUUID();
        const acquired = await redisClient.set(lockKey, token, 'EX', ttlSeconds, 'NX');
        if (!acquired) {
            return null;
        }

        return {
            key: lockKey,
            token,
            release: async () => {
                try {
                    const res = await redisClient.eval(RELEASE_LOCK_LUA, 1, lockKey, token);
                    return Number(res) === 1;
                } catch (err) {
                    dbLogger.warn(`[RedisLock] Gagal melepaskan lock ${lockKey}`, {
                        error: String(err),
                    });
                    return false;
                }
            },
        };
    } catch (err) {
        dbLogger.error(
            `[RedisLock] Error saat mencoba acquire lock ${lockKey}`,
            err instanceof Error ? err : new Error(String(err))
        );
        return null;
    }
}

/**
 * Eksekusi fungsi di dalam proteksi distributed lock yang aman.
 * Menjamin lock selalu dilepas secara atomik di dalam blok finally.
 */
export async function withLock<T>(
    lockKey: string,
    ttlSeconds: number,
    fn: (lock: LockHandle) => Promise<T>,
    redisClient: Redis = redis
): Promise<{ acquired: true; result: T } | { acquired: false; result?: undefined }> {
    const lock = await acquireLock(lockKey, ttlSeconds, redisClient);
    if (!lock) {
        return { acquired: false };
    }

    try {
        const result = await fn(lock);
        return { acquired: true, result };
    } finally {
        await lock.release();
    }
}
