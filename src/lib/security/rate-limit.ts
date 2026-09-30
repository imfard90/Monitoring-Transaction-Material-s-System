import { redis } from '@/lib/redis';

export async function rateLimit(
    identifier: string,
    limit: number,
    windowSec: number
): Promise<{ success: boolean; limit: number; remaining: number }> {
    const key = `ratelimit:${identifier}`;

    // Increment the count
    const count = await redis.incr(key);

    // If it's the first time, set the expiration
    if (count === 1) {
        await redis.expire(key, windowSec);
    }

    const success = count <= limit;
    const remaining = Math.max(0, limit - count);

    return { success, limit, remaining };
}
