import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.resetModules();
});

describe('Next.js security headers', () => {
    it('sets defensive browser headers on all paths', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        const { default: nextConfig } = await import('../../next.config.mjs');
        expect(nextConfig.headers).toBeDefined();
        const rules = await nextConfig.headers?.();

        expect(rules).toHaveLength(1);
        expect(rules?.[0].source).toBe('/:path*');
        expect(rules?.[0].headers).toEqual(
            expect.arrayContaining([
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'DENY' },
                {
                    key: 'Referrer-Policy',
                    value: 'strict-origin-when-cross-origin',
                },
                {
                    key: 'Permissions-Policy',
                    value: 'camera=(), microphone=(), geolocation=()',
                },
            ])
        );
        expect(rules?.[0].headers).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ key: 'Strict-Transport-Security' })])
        );
    });

    it('keeps CSP out of static Next config because proxy creates per-request nonces', async () => {
        const { default: nextConfig } = await import('../../next.config.mjs');
        const rules = await nextConfig.headers?.();
        const headerNames = rules?.flatMap((rule) => rule.headers.map((header) => header.key));

        expect(headerNames).not.toContain('Content-Security-Policy');
        expect(headerNames).not.toContain('Content-Security-Policy-Report-Only');
    });

    it('enables HSTS only in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { default: nextConfig } = await import('../../next.config.mjs');
        expect(nextConfig.headers).toBeDefined();
        const rules = await nextConfig.headers?.();

        expect(rules?.[0].headers).toContainEqual({
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
        });
    });
});
