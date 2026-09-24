import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';
import { redis } from './redis';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    trustedOrigins: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://mtms-app.credea.biz.id',
    ],
    database: pool,
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
    },
    session: {
        modelName: 'auth.session',
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
    },
    secondaryStorage: {
        get: async (key) => {
            const value = await redis.get(key);
            return value;
        },
        set: async (key, value, ttl) => {
            if (ttl) {
                await redis.set(key, value, 'EX', ttl);
            } else {
                await redis.set(key, value);
            }
        },
        delete: async (key) => {
            await redis.del(key);
        },
        getAndDelete: async (key) => {
            const value = await redis.get(key);
            await redis.del(key);
            return value;
        },
        increment: async (key: string, ttl?: number) => {
            const result = await redis.incr(key);
            if (ttl) {
                await redis.expire(key, ttl);
            }
            return result;
        },
    },
    plugins: [nextCookies()],
    user: {
        modelName: 'auth.user',
        additionalFields: {
            nik: {
                type: 'string',
                required: true,
            },
            is_active: {
                type: 'boolean',
                required: false,
            },
        },
    },
    account: {
        modelName: 'auth.account',
    },
    verification: {
        modelName: 'auth.verification',
    },

    // ─── Database Hooks ───────────────────────────────────────────────
    databaseHooks: {
        user: {
            update: {
                /**
                 * Prevent sign-in for inactive users.
                 * Better Auth calls user.update before creating a session (to update lastLogin etc.)
                 * We intercept here to check is_active.
                 */
                before: async (user) => {
                    // On sign-in, Better Auth updates the user record.
                    // We check is_active at the source — the DB itself.
                    if (user.id) {
                        const result = await pool.query(
                            'SELECT is_active FROM auth."user" WHERE id = $1',
                            [user.id]
                        );
                        const row = result.rows[0];
                        if (row && row.is_active === false) {
                            throw new Error(
                                'Akun Anda tidak aktif. Silakan hubungi administrator untuk mengaktifkan akun.'
                            );
                        }
                    }
                    return { data: user };
                },
            },
        },
    },
});
