import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
// Import Next.js internal helper that extracts the nonce during server rendering
import { getScriptNonceFromHeader } from 'next/dist/server/app-render/get-script-nonce-from-header';

describe('CSP Nonce Generation and Next.js Parser Compatibility', () => {
    it('sets matching nonces on both request headers and response headers', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/auth/login', {
            headers: {
                host: '127.0.0.1:8000',
                'x-forwarded-host': 'mtms-app.credea.biz.id',
                'x-forwarded-proto': 'https',
            },
        });

        const res = await proxy(req);
        const cspResponseHeader = res.headers.get('Content-Security-Policy');
        expect(cspResponseHeader).toBeTruthy();

        // Extract nonce using official Next.js App Router regex / parser
        const extractedNonce = getScriptNonceFromHeader(cspResponseHeader!);
        expect(extractedNonce).toBeDefined();
        expect(extractedNonce!.length).toBeGreaterThan(16);

        // Ensure CSP header includes the nonce directive
        expect(cspResponseHeader).toContain(`'nonce-${extractedNonce}'`);

        // Check cache control prevents caching nonce across requests
        const cacheControl = res.headers.get('Cache-Control');
        expect(cacheControl).toContain('no-store');
        expect(cacheControl).toContain('no-cache');
        expect(cacheControl).toContain('private');
    });

    it('generates cryptographically distinct nonces across multiple requests', async () => {
        const req1 = new NextRequest('http://127.0.0.1:8000/auth/login');
        const req2 = new NextRequest('http://127.0.0.1:8000/auth/login');

        const res1 = await proxy(req1);
        const res2 = await proxy(req2);

        const csp1 = res1.headers.get('Content-Security-Policy')!;
        const csp2 = res2.headers.get('Content-Security-Policy')!;

        const nonce1 = getScriptNonceFromHeader(csp1);
        const nonce2 = getScriptNonceFromHeader(csp2);

        expect(nonce1).toBeDefined();
        expect(nonce2).toBeDefined();
        expect(nonce1).not.toBe(nonce2);
    });

    it('preserves Cloudflare Turnstile in script-src, connect-src, and frame-src', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/auth/login');
        const res = await proxy(req);
        const csp = res.headers.get('Content-Security-Policy')!;

        expect(csp).toContain("script-src 'self' 'nonce-");
        expect(csp).toContain('https://challenges.cloudflare.com');
        expect(csp).toContain("connect-src 'self' https://challenges.cloudflare.com");
        expect(csp).not.toContain('https://api.iconify.design');
        expect(csp).toContain('frame-src https://challenges.cloudflare.com');
        expect(csp).toContain("frame-ancestors 'none'");
    });

    it('applies enforced CSP to unauthenticated redirects without leaking pages', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/apps/hasil-rekon');
        const res = await proxy(req);

        expect(res.status).toBe(307);
        const csp = res.headers.get('Content-Security-Policy')!;
        const nonce = getScriptNonceFromHeader(csp);
        expect(nonce).toBeDefined();
        expect(res.headers.get('Cache-Control')).toContain('no-store');
    });
});

