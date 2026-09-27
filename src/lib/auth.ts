import { render } from '@react-email/render';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';
import { Resend } from 'resend';
import { ResetPasswordEmail } from './emails/reset-password-email';
import { VerificationEmail } from './emails/verification-email';
import { redis } from './redis';

const resend = new Resend(process.env.RESEND_API_KEY);

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
        sendResetPassword: async ({ user, url }) => {
            const emailHtml = await render(ResetPasswordEmail({ url }));

            await resend.emails.send({
                from: 'noreply@mtms-app.credea.biz.id',
                to: user.email,
                subject: 'Reset Password MTMS',
                html: emailHtml,
            });
        },
    },
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
            const emailHtml = await render(VerificationEmail({ url }));

            await resend.emails.send({
                from: 'noreply@mtms-app.credea.biz.id',
                to: user.email,
                subject: 'Verifikasi Email Anda untuk MTMS',
                html: emailHtml,
            });
        },
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
        session: {
            create: {
                /**
                 * Prevent sign-in for inactive users.
                 * Intercept session creation to check if user is active.
                 */
                before: async (session) => {
                    if (session.userId) {
                        const result = await pool.query(
                            'SELECT is_active FROM auth."user" WHERE id = $1',
                            [session.userId]
                        );
                        const row = result.rows[0];
                        // If is_active is null, false, or anything other than true, block it
                        if (row && row.is_active !== true) {
                            throw new Error(
                                'Akun Anda tidak aktif. Silakan hubungi administrator untuk mengaktifkan akun.'
                            );
                        }
                    }
                    return { data: session };
                },
            },
        },
    },
});
