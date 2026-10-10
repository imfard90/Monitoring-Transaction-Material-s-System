import { actionLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';

export interface RateLimitConfig {
    limit: number;
    windowMs: number;
}

export interface RateLimitResult {
    success: boolean;
    remaining: number;
    limit: number;
    resetTime?: Date;
}

/**
 * Unified Redis-backed sliding-window rate limiter.
 *
 * Uses atomic INCR + EXPIRE (NX) pipeline. Fail-OPEN on Redis errors so
 * legitimate users are not blocked during outages.
 *
 * @param key      unique identifier (IP, user ID, session ID)
 * @param config   `{ limit, windowMs }` OR pass `limit` + `windowSec` positionally
 * @returns        `{ success, remaining, limit, resetTime? }`
 */
export async function rateLimit(
    key: string,
    config: RateLimitConfig
): Promise<RateLimitResult>;

export async function rateLimit(
    identifier: string,
    limit: number,
    windowSec: number
): Promise<RateLimitResult>;

export async function rateLimit(
    key: string,
    configOrLimit: RateLimitConfig | number,
    windowSec?: number
): Promise<RateLimitResult> {
    const { limit, windowInSeconds } =
        typeof configOrLimit === 'number'
            ? { limit: configOrLimit, windowInSeconds: windowSec ?? 60 }
            : {
                  limit: configOrLimit.limit,
                  windowInSeconds: Math.ceil(configOrLimit.windowMs / 1000),
              };

    const windowMs =
        typeof configOrLimit === 'number'
            ? windowInSeconds * 1000
            : configOrLimit.windowMs;

    try {
        const redisKey = `ratelimit:${key}`;

        const [current] =
            (await redis
                .multi()
                .incr(redisKey)
                .expire(redisKey, windowInSeconds, 'NX')
                .exec()) || [];

        if (!current || current[1] === null) {
            actionLogger.warn(
                `[RateLimit] Failed to read current count for ${key}`
            );
            return { success: true, remaining: limit, limit };
        }

        const count = Number(current[1]);
        const isAllowed = count <= limit;
        const remaining = Math.max(0, limit - count);

        if (!isAllowed) {
            actionLogger.warn(
                `[RateLimit] Request blocked for key: ${key}. Count: ${count}`
            );
        }

        return {
            success: isAllowed,
            remaining,
            limit,
            resetTime: new Date(Date.now() + windowMs),
        };
    } catch (error) {
        actionLogger.error(
            `[RateLimit] Redis error for key: ${key}`,
            error instanceof Error ? error : new Error(String(error))
        );
        return { success: true, remaining: limit, limit, resetTime: new Date() };
    }
}
