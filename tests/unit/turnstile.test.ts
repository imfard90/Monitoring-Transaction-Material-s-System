import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from '@/lib/security/turnstile';

vi.mock('@/lib/logger', () => ({
    securityLogger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('verifyTurnstileToken', () => {
    const originalSecret = process.env.TURNSTILE_SECRET_KEY;

    beforeEach(() => {
        process.env.TURNSTILE_SECRET_KEY = 'test-secret';
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
        else process.env.TURNSTILE_SECRET_KEY = originalSecret;
    });

    it('accepts a valid Cloudflare token', async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({ success: true, hostname: 'example.com', action: 'login' }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }
            )
        );

        const result = await verifyTurnstileToken('valid-token', '192.0.2.1', {
            expectedAction: 'login',
            expectedHostname: 'example.com',
        });

        expect(result.success).toBe(true);
        expect(result.code).toBe('OK');
        const request = vi.mocked(fetch).mock.calls[0]?.[1];
        expect(request?.method).toBe('POST');
        expect(String(request?.body)).toContain('remoteip=192.0.2.1');
    });

    it('fails closed when the secret is missing', async () => {
        delete process.env.TURNSTILE_SECRET_KEY;
        const result = await verifyTurnstileToken('valid-token');
        expect(result.success).toBe(false);
        expect(result.code).toBe('MISSING_SECRET');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('rejects invalid token input before network access', async () => {
        const result = await verifyTurnstileToken('');
        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_INPUT');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('returns Cloudflare error codes for an invalid token', async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
                {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                }
            )
        );

        const result = await verifyTurnstileToken('expired-token');
        expect(result.success).toBe(false);
        expect(result.code).toBe('INVALID_TOKEN');
        expect(result.errorCodes).toEqual(['timeout-or-duplicate']);
    });

    it('fails closed on network errors', async () => {
        vi.mocked(fetch).mockRejectedValue(new TypeError('network unavailable'));
        const result = await verifyTurnstileToken('valid-token');
        expect(result.success).toBe(false);
        expect(result.code).toBe('NETWORK_ERROR');
    });

    it('fails closed on request timeout', async () => {
        vi.mocked(fetch).mockImplementation(
            (_input, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                })
        );

        const result = await verifyTurnstileToken('valid-token', null, { timeoutMs: 1 });
        expect(result.success).toBe(false);
        expect(result.code).toBe('VALIDATION_TIMEOUT');
    });

    it('rejects a mismatched action even when Cloudflare reports success', async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ success: true, action: 'register' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            })
        );

        const result = await verifyTurnstileToken('valid-token', null, {
            expectedAction: 'login',
        });
        expect(result.success).toBe(false);
        expect(result.code).toBe('ACTION_MISMATCH');
    });
});
