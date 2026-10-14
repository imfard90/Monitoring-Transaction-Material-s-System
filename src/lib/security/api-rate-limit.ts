import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

export const API_RATE_LIMIT_WINDOW_SECONDS = 300; // 5 minutes
export const API_RATE_LIMIT_MAX_REQUESTS = 1;

export interface ApiRateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
    retryAt: string | null;
}

/**
 * Atomic user-level rate limiter for MTMS public API endpoints.
 * Enforces 1 request per 5 minutes per user across all API endpoints.
 *
 * @param userId - ID of the user owning the API key
 */
export async function checkAndConsumeApiRateLimit(userId: string): Promise<ApiRateLimitResult> {
    const redisKey = `ratelimit:api:user:${userId}`;

    try {
        const pipeline = redis.multi();
        pipeline.incr(redisKey);
        pipeline.expire(redisKey, API_RATE_LIMIT_WINDOW_SECONDS, 'NX');
        pipeline.ttl(redisKey);

        const results = await pipeline.exec();
        if (results?.length !== 3) {
            throw new Error('Redis rate-limit pipeline returned an incomplete result');
        }

        // Never treat command errors or malformed values as a successful allowance.
        const incrResult = results[0];
        if (
            incrResult?.[0] ||
            !Number.isSafeInteger(Number(incrResult?.[1])) ||
            Number(incrResult?.[1]) < 1
        ) {
            throw new Error('Redis rate-limit increment failed');
        }
        const count = Number(incrResult[1]);

        const ttlResult = results[2];
        if (ttlResult?.[0]) {
            throw new Error('Redis rate-limit TTL lookup failed');
        }
        let ttl = Number(ttlResult?.[1]);
        if (!Number.isSafeInteger(ttl)) {
            throw new Error('Redis rate-limit TTL is invalid');
        }
        if (ttl < 1) {
            ttl = API_RATE_LIMIT_WINDOW_SECONDS;
        }

        const allowed = count <= API_RATE_LIMIT_MAX_REQUESTS;

        if (!allowed) {
            actionLogger.warn(
                `[ApiRateLimit] Blocked user: ${userId}. Count: ${count}, TTL remaining: ${ttl}s`
            );
            const retryAt = new Date(Date.now() + ttl * 1000).toISOString();
            return {
                allowed: false,
                retryAfterSeconds: ttl,
                retryAt,
            };
        }

        return {
            allowed: true,
            retryAfterSeconds: 0,
            retryAt: null,
        };
    } catch (error) {
        actionLogger.error(
            `[ApiRateLimit] Redis error for user: ${userId}`,
            error instanceof Error ? error : new Error(String(error))
        );
        // Fail closed: API access must not bypass its required limit when Redis is unavailable.
        const retryAt = new Date(Date.now() + API_RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
        return {
            allowed: false,
            retryAfterSeconds: API_RATE_LIMIT_WINDOW_SECONDS,
            retryAt,
        };
    }
}
