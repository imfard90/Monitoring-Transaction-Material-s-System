import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { getPageSessionUser } from '@/lib/auth-server';
import { AuthenticationError } from '@/lib/errors';

const { mockAuthGetSession, mockDbQuery, mockRedirect } = vi.hoisted(() => ({
    mockAuthGetSession: vi.fn(),
    mockDbQuery: vi.fn(),
    mockRedirect: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    auth: { api: { getSession: mockAuthGetSession } },
}));

vi.mock('@/lib/db/db', () => ({
    db: { selectFrom: mockDbQuery },
}));

vi.mock('@/lib/logger', () => ({
    authLogger: { error: vi.fn() },
    logger: { error: vi.fn() },
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        mockRedirect(url);
        throw new Error(`NEXT_REDIRECT: ${url}`);
    },
}));

vi.mock('@/lib/redis', () => ({
    redis: {
        pipeline: vi.fn().mockReturnValue({ set: vi.fn(), exec: vi.fn().mockResolvedValue([]) }),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
    },
}));

vi.mock('@/lib/presence', () => ({
    touchUserPresence: vi.fn().mockResolvedValue(undefined),
}));

describe('proxy authentication and reverse proxy redirect handling', () => {
    it('redirects to /auth/login with public HTTPS URL when no cookie is present', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/', {
            headers: {
                host: '127.0.0.1:8000',
                'x-forwarded-host': 'mtms-app.credea.biz.id',
                'x-forwarded-proto': 'https',
            },
        });

        const res = await proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://mtms-app.credea.biz.id/auth/login');
    });

    it('redirects to /auth/login when cookie value is empty string', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/reference/wo-lensa-ref', {
            headers: {
                host: 'mtms-app.credea.biz.id',
                'x-forwarded-proto': 'https',
                cookie: 'better-auth.session_token=',
            },
        });

        const res = await proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://mtms-app.credea.biz.id/auth/login');
    });

    it('redirects to /auth/login when cookie value contains only whitespace', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/', {
            headers: {
                host: 'mtms-app.credea.biz.id',
                'x-forwarded-proto': 'https',
                cookie: '__Secure-better-auth.session_token=   ',
            },
        });

        const res = await proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://mtms-app.credea.biz.id/auth/login');
    });

    it('allows access when valid session token cookie exists', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/', {
            headers: {
                host: 'mtms-app.credea.biz.id',
                'x-forwarded-proto': 'https',
                cookie: 'better-auth.session_token=valid-session-token-12345',
            },
        });

        const res = await proxy(req);
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
    });

    it('allows access to public live-stock page even without cookie', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/live-stock', {
            headers: {
                host: 'mtms-app.credea.biz.id',
                'x-forwarded-proto': 'https',
            },
        });

        const res = await proxy(req);
        expect(res.status).toBe(200);
    });

    it('redirects logged in user away from /auth/login to /', async () => {
        const req = new NextRequest('http://127.0.0.1:8000/auth/login', {
            headers: {
                host: '127.0.0.1:8000',
                'x-forwarded-host': 'mtms-app.credea.biz.id',
                'x-forwarded-proto': 'https',
                cookie: '__Secure-better-auth.session_token=valid-session-token-12345',
            },
        });

        const res = await proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('https://mtms-app.credea.biz.id/');
    });
});

describe('getPageSessionUser helper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirects to /auth/login when user has no session (AuthenticationError)', async () => {
        mockAuthGetSession.mockResolvedValue(null);

        await expect(getPageSessionUser()).rejects.toThrow('NEXT_REDIRECT: /auth/login');
        expect(mockRedirect).toHaveBeenCalledWith('/auth/login');
    });

    it('resolves session user when authenticated', async () => {
        mockAuthGetSession.mockResolvedValue({
            user: { nik: 'USR001', name: 'Test User' },
            session: { id: 'sess_1' },
        });

        mockDbQuery.mockReturnValue({
            leftJoin: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({
                level_name: 'Administrator',
                branch_id: 1,
                branch_name: 'Branch A',
            }),
        });

        const user = await getPageSessionUser();
        expect(user.nik).toBe('USR001');
        expect(user.role).toBe('Administrator');
        expect(mockRedirect).not.toHaveBeenCalled();
    });
});
