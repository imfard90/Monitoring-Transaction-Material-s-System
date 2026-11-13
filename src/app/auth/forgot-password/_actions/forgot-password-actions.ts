'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { actionLogger, securityLogger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { logAuthEvent } from '@/lib/security/auth-audit.service';
import { verifyTurnstileToken } from '@/lib/security/turnstile';

const forgotPasswordSchema = z.object({
    email: z.string().trim().email('Format email tidak valid'),
    turnstileToken: z.string().min(1, 'Verifikasi keamanan diperlukan'),
});

/**
 * Handles password reset requests with rate limiting and Turnstile CAPTCHA.
 * Limits:
 * - 5 requests per 15 minutes per IP
 * - 3 requests per 15 minutes per Email
 */
export async function requestPasswordResetAction(params: {
    email: string;
    turnstileToken: string;
}): Promise<{ success: boolean; error?: string }> {
    const parsed = forgotPasswordSchema.safeParse(params);
    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message || 'Data input tidak valid.',
        };
    }

    const { email, turnstileToken } = parsed.data;

    // 1. Verify Cloudflare Turnstile token
    const captchaResult = await verifyTurnstileToken(turnstileToken);
    if (!captchaResult.success) {
        return {
            success: false,
            error: 'Verifikasi keamanan (CAPTCHA) gagal. Silakan muat ulang halaman dan coba lagi.',
        };
    }

    // 2. Extract client IP
    const reqHeaders = await headers();
    const clientIp =
        reqHeaders.get('cf-connecting-ip') ||
        reqHeaders.get('x-real-ip') ||
        reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        '127.0.0.1';

    // 3. Rate limit per IP: max 5 requests per 15 minutes (900 seconds)
    const ipRate = await rateLimit(`forgot_pwd_ip:${clientIp}`, 5, 900);
    if (!ipRate.success) {
        securityLogger.warn('Forgot password rate limit exceeded for IP', undefined, { clientIp });
        return {
            success: false,
            error: 'Terlalu banyak permintaan reset password dari jaringan Anda. Silakan coba lagi dalam 15 menit.',
        };
    }

    // 4. Rate limit per Email: max 3 requests per 15 minutes (900 seconds)
    const emailRate = await rateLimit(`forgot_pwd_email:${email.toLowerCase()}`, 3, 900);
    if (!emailRate.success) {
        securityLogger.warn('Forgot password rate limit exceeded for email', undefined, { email });
        return {
            success: false,
            error: 'Terlalu banyak permintaan reset untuk email ini. Silakan periksa kotak masuk atau coba lagi dalam 15 menit.',
        };
    }

    // 5. Trigger password reset via Better Auth
    try {
        await auth.api.requestPasswordReset({
            body: {
                email,
                redirectTo: '/auth/reset-password',
            },
            headers: reqHeaders,
        });

        await logAuthEvent({
            eventType: 'PASSWORD_RESET_REQUESTED',
            status: 'SUCCESS',
            ipAddress: clientIp,
            userAgent: reqHeaders.get('user-agent'),
            reason: `Permintaan reset password untuk ${email}`,
            metadata: { email },
        });

        return { success: true };
    } catch (err) {
        actionLogger.error(
            'Failed to process password reset request',
            err instanceof Error ? err : new Error(String(err)),
            { email }
        );
        // Fail-safe response to prevent user enumeration
        return { success: true };
    }
}

