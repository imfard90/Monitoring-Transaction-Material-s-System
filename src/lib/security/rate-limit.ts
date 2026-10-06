import { redis } from '@/lib/redis';

export async function rateLimit(
    identifier: string,
    limit: number,
    windowSec: number
): Promise<{ success: boolean; limit: number; remaining: number }> {
    const key = `ratelimit:${identifier}`;

    // Execute an atomic transaction via a pipeline (multi/exec)
    const [current] =
        (await redis
            .multi()
            .incr(key)
            .expire(key, windowSec, 'NX') // set expiration only if it doesn't exist
            .exec()) || [];

    const count = current && current[1] !== null ? Number(current[1]) : 1;

    const success = count <= limit;
    const remaining = Math.max(0, limit - count);

    return { success, limit, remaining };
}
