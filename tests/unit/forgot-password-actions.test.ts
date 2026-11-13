import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestPasswordReset = vi.fn();
const mockVerifyTurnstileToken = vi.fn();
const mockRateLimit = vi.fn();
const mockLogAuthEvent = vi.fn();

vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            requestPasswordReset: mockRequestPasswordReset,
        },
    },
}));

vi.mock('@/lib/security/turnstile', () => ({
    verifyTurnstileToken: mockVerifyTurnstileToken,
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: mockRateLimit,
}));

vi.mock('@/lib/security/auth-audit.service', () => ({
    logAuthEvent: mockLogAuthEvent,
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: { error: vi.fn(), info: vi.fn() },
    securityLogger: { warn: vi.fn(), info: vi.fn() },
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => {
        const h = new Headers();
        h.set('cf-connecting-ip', '192.168.1.100');
        h.set('user-agent', 'Mozilla/5.0 Vitest');
        return h;
    }),
}));

const { requestPasswordResetAction } = await import(
    '@/app/auth/forgot-password/_actions/forgot-password-actions'
);

describe('requestPasswordResetAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockVerifyTurnstileToken.mockResolvedValue({ success: true });
        mockRateLimit.mockResolvedValue({ success: true });
        mockRequestPasswordReset.mockResolvedValue({ status: true });
        mockLogAuthEvent.mockResolvedValue(undefined);
    });

    it('rejects invalid email formats', async () => {
        const res = await requestPasswordResetAction({
            email: 'not-an-email',
            turnstileToken: 'valid-token',
        });

        expect(res.success).toBe(false);
        expect(res.error).toBe('Format email tidak valid');
        expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
    });

    it('rejects empty turnstile token', async () => {
        const res = await requestPasswordResetAction({
            email: 'user@example.com',
            turnstileToken: '',
        });

        expect(res.success).toBe(false);
        expect(res.error).toBe('Verifikasi keamanan diperlukan');
        expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
    });

    it('fails when Turnstile verification fails', async () => {
        mockVerifyTurnstileToken.mockResolvedValue({
            success: false,
            errorCodes: ['invalid-input-response'],
        });

        const res = await requestPasswordResetAction({
            email: 'user@example.com',
            turnstileToken: 'invalid-token',
        });

        expect(res.success).toBe(false);
        expect(res.error).toContain('CAPTCHA');
        expect(mockRateLimit).not.toHaveBeenCalled();
    });

    it('blocks request when IP rate limit is exceeded', async () => {
        mockRateLimit.mockImplementation(async (key: string) => {
            if (key.startsWith('forgot_pwd_ip:')) {
                return { success: false, remaining: 0, reset: 900 };
            }
            return { success: true };
        });

        const res = await requestPasswordResetAction({
            email: 'user@example.com',
            turnstileToken: 'valid-token',
        });

        expect(res.success).toBe(false);
        expect(res.error).toContain('Terlalu banyak permintaan reset password dari jaringan Anda');
        expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    });

    it('blocks request when email rate limit is exceeded', async () => {
        mockRateLimit.mockImplementation(async (key: string) => {
            if (key.startsWith('forgot_pwd_email:')) {
                return { success: false, remaining: 0, reset: 900 };
            }
            return { success: true };
        });

        const res = await requestPasswordResetAction({
            email: 'user@example.com',
            turnstileToken: 'valid-token',
        });

        expect(res.success).toBe(false);
        expect(res.error).toContain('Terlalu banyak permintaan reset untuk email ini');
        expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    });

    it('successfully calls Better Auth requestPasswordReset and logs auth event', async () => {
        const res = await requestPasswordResetAction({
            email: 'user@example.com',
            turnstileToken: 'valid-token',
        });

        expect(res.success).toBe(true);
        expect(res.error).toBeUndefined();
        expect(mockRequestPasswordReset).toHaveBeenCalledWith(
            expect.objectContaining({
                body: {
                    email: 'user@example.com',
                    redirectTo: '/auth/reset-password',
                },
            })
        );
        expect(mockLogAuthEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: 'PASSWORD_RESET_REQUESTED',
                status: 'SUCCESS',
                ipAddress: '192.168.1.100',
            })
        );
    });

    it('returns success: true even if Better Auth throws error to prevent user enumeration', async () => {
        mockRequestPasswordReset.mockRejectedValue(new Error('User not found'));

        const res = await requestPasswordResetAction({
            email: 'nonexistent@example.com',
            turnstileToken: 'valid-token',
        });

        expect(res.success).toBe(true);
    });
});

