/**
 * Encrypted Cache Utility for MTMS
 *
 * Provides encrypted caching for sensitive data using JWE (A256GCM) via jose.
 * Each user gets their own cache namespace with 30-second TTL default.
 *
 * Key derivation: CACHE_ENCRYPTION_KEY env var is used directly as the AES key.
 * The env var must be a base64-encoded 32-byte value.
 * Generate with: openssl rand -base64 32
 */

import { EncryptJWT, jwtDecrypt } from 'jose';
import { redis } from '@/lib/redis';

// Cache configuration
const CACHE_CONFIG = {
    TTL: 30,
    PREFIX: 'enc_cache',
    USER_NS: 'user',
} as const;

// ─── Key Management ──────────────────────────────────────────────────────────

/**
 * Get the encryption key as Uint8Array.
 * CACHE_ENCRYPTION_KEY must be base64-encoded 32-byte value.
 */
function getEncryptionKey(): Uint8Array {
    const secret = process.env.CACHE_ENCRYPTION_KEY;

    if (!secret) {
        if (process.env.NODE_ENV !== 'development') {
            throw new Error(
                '[EncryptedCache] CACHE_ENCRYPTION_KEY environment variable is required in non-development environments.'
            );
        }
        console.warn(
            '[EncryptedCache] CACHE_ENCRYPTION_KEY not set. Using insecure fallback — set this in .env for development.'
        );
        return Uint8Array.from(
            'dddddddddddddddddddddddddddddddd'
                .slice(0, 32)
                .split('')
                .map((c) => c.charCodeAt(0))
        );
    }

    const keyBuffer = Buffer.from(secret, 'base64');

    if (keyBuffer.length !== 32) {
        throw new Error(
            `[EncryptedCache] CACHE_ENCRYPTION_KEY must be a base64-encoded 32-byte value. ` +
                `Got ${keyBuffer.length} bytes. Generate with: openssl rand -base64 32`
        );
    }

    return new Uint8Array(keyBuffer);
}

let _encryptionKey: Uint8Array | null = null;

function getKey(): Uint8Array {
    if (!_encryptionKey) {
        _encryptionKey = getEncryptionKey();
    }
    return _encryptionKey;
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

export async function encrypt<T>(data: T): Promise<string> {
    const key = getKey();

    const token = await new EncryptJWT({ data })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setExpirationTime('30s')
        .encrypt(key);

    return token;
}

export async function decrypt<T>(token: string): Promise<T> {
    const key = getKey();

    try {
        const { payload } = await jwtDecrypt(token, key);
        return payload.data as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown decryption error';
        throw new Error(`[EncryptedCache] Decryption failed: ${message}`);
    }
}

// ─── Cache Key Helpers ───────────────────────────────────────────────────────

export function getUserCacheKey(
    userId: string | number,
    cacheType: string,
    identifier?: string
): string {
    const id = String(userId);
    return identifier
        ? `${CACHE_CONFIG.PREFIX}:${CACHE_CONFIG.USER_NS}:${id}:${cacheType}:${identifier}`
        : `${CACHE_CONFIG.PREFIX}:${CACHE_CONFIG.USER_NS}:${id}:${cacheType}`;
}

export function getGeneralCacheKey(cacheType: string, identifier?: string): string {
    return identifier
        ? `${CACHE_CONFIG.PREFIX}:general:${cacheType}:${identifier}`
        : `${CACHE_CONFIG.PREFIX}:general:${cacheType}`;
}

// ─── SCAN helper (non-blocking key scan) ─────────────────────────────────────

async function scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
        // ioredis scan returns [cursor, elements]
        const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = reply[0];
        keys.push(...reply[1]);
    } while (cursor !== '0');

    return keys;
}

// ─── EncryptedCache Class ─────────────────────────────────────────────────────

export class EncryptedCache {
    private readonly defaultTTL: number;

    constructor(ttl: number = CACHE_CONFIG.TTL) {
        this.defaultTTL = ttl;
    }

    async get<T>(
        userId: string | number,
        cacheType: string,
        identifier?: string
    ): Promise<T | null> {
        try {
            const key = getUserCacheKey(userId, cacheType, identifier);
            const encryptedData = await redis.get(key);

            if (!encryptedData) return null;

            const decrypted = await decrypt<T>(encryptedData);
            console.debug(`[EncryptedCache] HIT: ${key}`);
            return decrypted;
        } catch (error) {
            console.error('[EncryptedCache] Decryption error', error);
            return null;
        }
    }

    async set<T>(
        userId: string | number,
        cacheType: string,
        data: T,
        identifier?: string,
        ttl: number = this.defaultTTL
    ): Promise<void> {
        try {
            const key = getUserCacheKey(userId, cacheType, identifier);
            const encryptedData = await encrypt(data);

            await redis.set(key, encryptedData, 'EX', ttl);
            console.debug(`[EncryptedCache] SET: ${key} (TTL: ${ttl}s)`);
        } catch (error) {
            console.error('[EncryptedCache] Set error', error);
        }
    }

    async invalidate(userId: string | number, cacheType?: string): Promise<void> {
        try {
            const pattern = cacheType
                ? `${CACHE_CONFIG.PREFIX}:${CACHE_CONFIG.USER_NS}:${userId}:${cacheType}:*`
                : `${CACHE_CONFIG.PREFIX}:${CACHE_CONFIG.USER_NS}:${userId}:*`;

            const keys = await scanKeys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }

            console.debug(
                `[EncryptedCache] Invalidated cache for user: ${userId}, type: ${cacheType ?? 'all'}`
            );
        } catch (error) {
            console.error('[EncryptedCache] Invalidate error', error);
        }
    }

    async invalidateAll(): Promise<void> {
        try {
            const keys = await scanKeys(`${CACHE_CONFIG.PREFIX}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }

            console.debug(`[EncryptedCache] Invalidated all ${keys.length} cache entries`);
        } catch (error) {
            console.error('[EncryptedCache] InvalidateAll error', error);
        }
    }

    async getGeneral<T>(cacheType: string, identifier?: string): Promise<T | null> {
        try {
            const key = getGeneralCacheKey(cacheType, identifier);
            const encryptedData = await redis.get(key);

            if (!encryptedData) return null;

            return await decrypt<T>(encryptedData);
        } catch (error) {
            console.error('[EncryptedCache] General get error', error);
            return null;
        }
    }

    async setGeneral<T>(
        cacheType: string,
        data: T,
        identifier?: string,
        ttl: number = this.defaultTTL
    ): Promise<void> {
        try {
            const key = getGeneralCacheKey(cacheType, identifier);
            const encryptedData = await encrypt(data);
            await redis.set(key, encryptedData, 'EX', ttl);
        } catch (error) {
            console.error('[EncryptedCache] General set error', error);
        }
    }

    async invalidateGeneral(cacheType?: string): Promise<void> {
        try {
            const pattern = cacheType
                ? `${CACHE_CONFIG.PREFIX}:general:${cacheType}:*`
                : `${CACHE_CONFIG.PREFIX}:general:*`;

            const keys = await scanKeys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (error) {
            console.error('[EncryptedCache] General invalidate error', error);
        }
    }
}

export const encryptedCache = new EncryptedCache();
export const cacheConfig = CACHE_CONFIG;
export default encryptedCache;
