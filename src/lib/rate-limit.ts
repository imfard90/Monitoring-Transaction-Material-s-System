import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

interface RateLimitConfig {
    limit: number;
    windowMs: number;
}

/**
 * Basic Token Bucket / Window rate limiter using Redis
 * @param key unique identifier for the request (e.g., IP address or User ID)
 * @param config rate limit configuration
 * @returns object indicating if request is allowed and remaining requests
 */
export async function rateLimit(key: string, config: RateLimitConfig) {
    try {
        const windowInSeconds = Math.ceil(config.windowMs / 1000);

        // Use a simple atomic INC operation with expiration
        const redisKey = `ratelimit:${key}`;

        // Execute an atomic transaction via a pipeline (multi/exec)
        const [current] =
            (await redis
                .multi()
                .incr(redisKey)
                .expire(redisKey, windowInSeconds, 'NX') // set expiration only if it doesn't exist
                .exec()) || [];

        if (!current || current[1] === null) {
            actionLogger.warn(`[RateLimit] Failed to read current count for ${key}`);
            return { success: true, remaining: config.limit }; // Fail open
        }

        const count = Number(current[1]);
        const isAllowed = count <= config.limit;
        const remaining = Math.max(0, config.limit - count);

        if (!isAllowed) {
            actionLogger.warn(`[RateLimit] Request blocked for key: ${key}. Count: ${count}`);
        }

        return {
            success: isAllowed,
            remaining,
            resetTime: new Date(Date.now() + config.windowMs),
        };
    } catch (error) {
        actionLogger.error(
            `[RateLimit] Redis error for key: ${key}`,
            error instanceof Error ? error : new Error(String(error))
        );
        // Fail open to avoid blocking legitimate users if Redis goes down
        return { success: true, remaining: config.limit, resetTime: new Date() };
    }
}
