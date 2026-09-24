import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;
const redisPass = process.env.REDIS_PASS;

if (!redisUrl) {
    throw new Error('REDIS_URL is not defined in the environment variables');
}

export const redis = new Redis(redisUrl, {
    password: redisPass,
    family: 4,
});

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

redis.on('connect', () => {});
