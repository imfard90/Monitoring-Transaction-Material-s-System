import Redis from 'ioredis';
import { dbLogger } from '@/lib/logger';

const redisUrl = process.env.REDIS_URL;
const redisPass = process.env.REDIS_PASS;

if (!redisUrl) {
    throw new Error('REDIS_URL is not defined in the environment variables');
}

export const redis = new Redis(redisUrl, {
    password: redisPass,
    family: 4,
    // Task 4: Retry & Reconnect Strategy
    retryStrategy(times) {
        // Maximum delay of 3 seconds between retries
        const delay = Math.min(times * 100, 3000);
        dbLogger.info(`[Redis] Reconnecting... Attempt: ${times} (Delay: ${delay}ms)`);

        // Stop retrying after 50 attempts to prevent infinite loops
        if (times >= 50) {
            dbLogger.error('[Redis] Max retries reached. Stopping reconnection attempts.');
            return null; // Stop retrying
        }
        return delay;
    },
    maxRetriesPerRequest: 3, // Prevent requests from hanging indefinitely
});

redis.on('error', (err) => {
    dbLogger.error('Redis connection error', err);
});

redis.on('connect', () => {});
