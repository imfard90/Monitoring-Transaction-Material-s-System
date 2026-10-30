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

import { ConflictError } from '@/lib/errors';
import { securityLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

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
            securityLogger.debug('[Idempotency] Hit', { key: `${redisKey.slice(0, 20)}...` });

            if (existing === 'PENDING') {
                return { isDuplicate: true, cachedResult: null };
            }

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
        securityLogger.warn('[Idempotency] Redis unavailable or error, skipping check', {
            error: String(e),
        });
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
        securityLogger.warn('[Idempotency] Redis unavailable or error, skipping store', {
            error: String(e),
        });
    }
}

/**
 * Check dan store dalam satu operasi atomik
 * Mencegah race condition (TOCTOU) dengan reservasi atomik SET NX EX
 */
export async function checkAndStoreIdempotency<TInput, TResult>(
    key: string,
    input: TInput,
    operation: (data: TInput) => Promise<TResult>,
    config: IdempotencyConfig = IDEMPOTENCY_CONFIGS.inventoryTx
): Promise<{ result: TResult; isDuplicate: boolean }> {
    const redisKey = `${config.prefix}:${key}`;
    let isReserved = false;

    try {
        // Atomic reservation to prevent double-submit race condition
        const reserved = await redis.set(redisKey, 'PENDING', 'EX', config.ttl, 'NX');

        if (!reserved) {
            // Key already exists, check if completed result is cached
            const existing = await redis.get(redisKey);
            if (existing && existing !== 'PENDING') {
                try {
                    return {
                        result: JSON.parse(existing) as TResult,
                        isDuplicate: true,
                    };
                } catch {
                    // Ignore JSON parse error and throw ConflictError below
                }
            }
            throw new ConflictError('Transaksi serupa sedang diproses atau telah selesai.');
        }
        isReserved = true;
    } catch (error) {
        if (error instanceof ConflictError) throw error;
        securityLogger.warn(
            '[Idempotency] Redis unavailable during reservation, proceeding gracefully without lock',
            { error: String(error) }
        );
    }

    try {
        // Execute operation
        const result = await operation(input);

        // Store result atomically if reserved
        if (isReserved) {
            try {
                await redis.set(redisKey, JSON.stringify(result), 'EX', config.ttl);
            } catch (err) {
                securityLogger.warn('[Idempotency] Failed to store result in Redis', {
                    error: String(err),
                });
            }
        }

        return { result, isDuplicate: false };
    } catch (error) {
        // If operation fails, clean up the pending reservation so the user can retry
        if (isReserved) {
            try {
                await redis.del(redisKey);
            } catch (err) {
                securityLogger.warn('[Idempotency] Failed to clean up pending key on error', {
                    error: String(err),
                });
            }
        }
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
