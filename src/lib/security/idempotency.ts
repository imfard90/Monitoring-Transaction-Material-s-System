/**
 * Idempotency Module for MTMS
 * Provides idempotency key management untuk prevent duplicate requests
 *
 * Usage:
 * - Inventory Transactions: Mencegah duplicate submission mutasi stok
 * - Login: Mencegah duplicate login attempts
 *
 * NOTE: Server-side functions that use Redis should be imported only in
 * server components/actions to avoid bundling node modules in client.
 */

import { redis } from '@/lib/redis';
import { securityLogger } from '@/lib/logger';

// ============================================
// Types
// ============================================

export interface IdempotencyConfig {
    prefix: string;
    ttl: number; // dalam detik
}

export interface IdempotencyResult<T = unknown> {
    isDuplicate: boolean;
    cachedResult: T | null;
}

// ============================================
// Constants - Idempotency configurations per operation
// ============================================

export const IDEMPOTENCY_CONFIGS = {
    /** Mutasi Stok: 5 menit TTL */
    inventoryTx: { prefix: 'idem:inventory', ttl: 300 },

    /** Login: 15 menit TTL */
    login: { prefix: 'idem:login', ttl: 900 },

    /** Data Upload: 2 jam TTL */
    dataUpload: { prefix: 'idem:upload', ttl: 7200 },
} as const satisfies Record<string, IdempotencyConfig>;

// ============================================
// Server-Side Functions (Node.js)
// ============================================

/**
 * Check dan store idempotency key
 * Returns cached result jika duplicate, null jika baru
 */
export async function checkIdempotency<T = unknown>(
    key: string,
    config: IdempotencyConfig = IDEMPOTENCY_CONFIGS.inventoryTx
): Promise<IdempotencyResult<T>> {
    try {
        const redisKey = `${config.prefix}:${key}`;
        const existing = await redis.get(redisKey);

        if (existing) {
            // biome-ignore lint/suspicious/noConsole: needed for security logs
            console.debug(`[Idempotency] Hit`, { key: `${redisKey.slice(0, 20)}...` });

            try {
                return {
                    isDuplicate: true,
                    cachedResult: JSON.parse(existing) as T,
                };
            } catch {
                return { isDuplicate: true, cachedResult: null };
            }
        }
    } catch (e) {
        securityLogger.warn('[Idempotency] Redis unavailable or error, skipping check', { error: String(e) });
    }

    return { isDuplicate: false, cachedResult: null };
}

/**
 * Store result untuk idempotency key
 * Dipanggil SETELAH operasi berhasil
 */
export async function storeIdempotencyResult<T = unknown>(
    key: string,
    result: T,
    config: IdempotencyConfig = IDEMPOTENCY_CONFIGS.inventoryTx
): Promise<void> {
    try {
        const redisKey = `${config.prefix}:${key}`;
        await redis.set(redisKey, JSON.stringify(result), 'EX', config.ttl);

        securityLogger.debug(`[Idempotency] Result stored`, {
            key: `${redisKey.slice(0, 20)}...`,
            ttl: config.ttl,
        });
    } catch (e) {
        securityLogger.warn('[Idempotency] Redis unavailable or error, skipping store', { error: String(e) });
    }
}

/**
 * Check dan store dalam satu operasi
 * Convenience function untuk operasi yang sering digunakan
 */
export async function checkAndStoreIdempotency<TInput, TResult>(
    key: string,
    input: TInput,
    operation: (data: TInput) => Promise<TResult>,
    config: IdempotencyConfig = IDEMPOTENCY_CONFIGS.inventoryTx
): Promise<{ result: TResult; isDuplicate: boolean }> {
    const redisKey = `${config.prefix}:${key}`;

    // Try to reserve the key to prevent race conditions (TOCTOU)
    const reserved = await redis.set(redisKey, 'PENDING', 'EX', config.ttl, 'NX');

    if (!reserved) {
        // Key already exists, it's a duplicate
        const existing = await redis.get(redisKey);
        if (existing && existing !== 'PENDING') {
            try {
                return {
                    result: JSON.parse(existing) as TResult,
                    isDuplicate: true,
                };
            } catch {
                // Ignore parse error and fall through to throw
            }
        }
        throw new Error('Concurrent request in progress or invalid cached result');
    }

    try {
        // Execute operation
        const result = await operation(input);

        // Store result
        await redis.set(redisKey, JSON.stringify(result), 'EX', config.ttl);

        return { result, isDuplicate: false };
    } catch (error) {
        // If operation fails, delete the pending key so it can be retried
        await redis.del(redisKey);
        throw error;
    }
}

/**
 * Delete idempotency key (untuk cleanup/manual invalidation)
 */
export async function deleteIdempotencyKey(
    key: string,
    config: IdempotencyConfig = IDEMPOTENCY_CONFIGS.inventoryTx
): Promise<void> {
    try {
        const redisKey = `${config.prefix}:${key}`;
        await redis.del(redisKey);
    } catch (e) {
        securityLogger.warn('[Idempotency] Error deleting key', { error: String(e) });
    }
}

// ============================================
// Export barrel
// ============================================

export default {
    checkIdempotency,
    storeIdempotencyResult,
    checkAndStoreIdempotency,
    deleteIdempotencyKey,
};
