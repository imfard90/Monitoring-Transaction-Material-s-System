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
export async function checkAndConsumeApiRateLimit(
    userId: string
): Promise<ApiRateLimitResult> {
    const redisKey = `ratelimit:api:user:${userId}`;

    try {
        const pipeline = redis.multi();
        pipeline.incr(redisKey);
        pipeline.expire(redisKey, API_RATE_LIMIT_WINDOW_SECONDS, 'NX');
        pipeline.ttl(redisKey);

        const results = (await pipeline.exec()) || [];

        // results: [[null, incrResult], [null, expireResult], [null, ttlResult]]
        const incrErr = results[0]?.[0];
        const count = incrErr ? 1 : Number(results[0]?.[1] ?? 1);

        const ttlErr = results[2]?.[0];
        let ttl = ttlErr ? API_RATE_LIMIT_WINDOW_SECONDS : Number(results[2]?.[1] ?? API_RATE_LIMIT_WINDOW_SECONDS);
        if (ttl <= 0) {
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
        // Fail open if Redis is down so critical integrations don't completely lock out
        return {
            allowed: true,
            retryAfterSeconds: 0,
            retryAt: null,
        };
    }
}
