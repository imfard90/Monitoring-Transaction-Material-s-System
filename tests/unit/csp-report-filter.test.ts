import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isNoiseViolation, POST } from '@/app/api/csp-report/route';
import { securityLogger } from '@/lib/logger';
import { proxy } from '@/proxy';

vi.mock('@/lib/logger', () => ({
    securityLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 100, limit: 120 }),
}));

describe('CSP Noise Filtering and Reporting Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    describe('isNoiseViolation', () => {
        it('identifies Chrome extension injection as noise', () => {
            expect(
                isNoiseViolation(
                    'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/contentscript.js'
                )
            ).toBe(true);
            expect(isNoiseViolation(undefined, 'chrome-extension://idm-extension/script.js')).toBe(
                true
            );
        });

        it('identifies Firefox, Safari, and Edge extension schemes as noise', () => {
            expect(isNoiseViolation('moz-extension://uuid/content.js')).toBe(true);
            expect(isNoiseViolation('safari-extension://com.example/injected.js')).toBe(true);
            expect(isNoiseViolation('safari-web-extension://com.example/injected.js')).toBe(true);
            expect(isNoiseViolation('edge-extension://id/bundle.js')).toBe(true);
        });

        it('identifies inline eval and about:blank pseudo-URIs as noise', () => {
            expect(isNoiseViolation('about:blank')).toBe(true);
            expect(isNoiseViolation('about:srcdoc')).toBe(true);
            expect(isNoiseViolation('eval')).toBe(true);
            expect(isNoiseViolation('inline')).toBe(true);
        });

        it('does NOT filter real external or internal violation domains', () => {
            expect(isNoiseViolation('https://malicious-domain.com/steal.js')).toBe(false);
            expect(isNoiseViolation('https://untrusted-cdn.com/lib.js')).toBe(false);
            expect(isNoiseViolation('http://192.168.1.50/api')).toBe(false);
        });
    });

    describe('POST /api/csp-report Handler', () => {
        it('silently ignores extension noise without logging warnings', async () => {
            const payload = {
                'csp-report': {
                    'document-uri': 'https://mtms-app.credea.biz.id/dashboard',
                    'blocked-uri': 'chrome-extension://gighmmpiobklfepjocnamgkkbiglidom/adblock.js',
                    'violated-directive': 'script-src',
                },
            };

            const request = new Request('http://localhost:3000/api/csp-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/csp-report' },
                body: JSON.stringify(payload),
            });

            const response = await POST(request);
            expect(response.status).toBe(204);
            expect(securityLogger.warn).not.toHaveBeenCalled();
        });

        it('logs a structured warning when a real domain violation occurs', async () => {
            const payload = {
                'csp-report': {
                    'document-uri': 'https://mtms-app.credea.biz.id/dashboard',
                    'blocked-uri': 'https://unauthorized-script-host.com/tracker.js',
                    'violated-directive': 'script-src',
                    disposition: 'enforce',
                },
            };

            const request = new Request('http://localhost:3000/api/csp-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/csp-report' },
                body: JSON.stringify(payload),
            });

            const response = await POST(request);
            expect(response.status).toBe(204);
            expect(securityLogger.warn).toHaveBeenCalledWith(
                'Real CSP violation detected',
                undefined,
                expect.objectContaining({
                    blockedUri: 'https://unauthorized-script-host.com/tracker.js',
                    violatedDirective: 'script-src',
                })
            );
        });
    });

    describe('Conditional CSP report-uri Directive', () => {
        it('omits report-uri directive by default in production', async () => {
            vi.stubEnv('NODE_ENV', 'production');
            delete process.env.ENABLE_CSP_REPORTING;

            const req = new NextRequest('http://127.0.0.1:8000/auth/login');
            const res = await proxy(req);
            const csp = res.headers.get('Content-Security-Policy') ?? '';

            expect(csp).not.toContain('report-uri /api/csp-report');
        });

        it('includes report-uri directive when ENABLE_CSP_REPORTING is true', async () => {
            vi.stubEnv('NODE_ENV', 'production');
            vi.stubEnv('ENABLE_CSP_REPORTING', 'true');

            const req = new NextRequest('http://127.0.0.1:8000/auth/login');
            const res = await proxy(req);
            const csp = res.headers.get('Content-Security-Policy') ?? '';

            expect(csp).toContain('report-uri /api/csp-report');
        });
    });
});
