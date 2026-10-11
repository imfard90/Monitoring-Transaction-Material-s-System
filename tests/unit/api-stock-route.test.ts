import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/v1/stock/route';
import { authenticateApiRequest } from '@/lib/security/api-auth';
import { getStockBalancesForApiUser } from '@/lib/services/stock-api.service';

vi.mock('@/lib/security/api-auth', () => ({
    authenticateApiRequest: vi.fn(),
}));

vi.mock('@/lib/services/stock-api.service', () => ({
    getStockBalancesForApiUser: vi.fn(),
}));

describe('GET /api/v1/stock Route Handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 Problem Details when auth fails', async () => {
        vi.mocked(authenticateApiRequest).mockResolvedValue({
            ok: false,
            status: 401,
            title: 'Unauthorized',
            detail: 'API Key tidak valid',
        });

        const req = new Request('http://localhost:3000/api/v1/stock');
        const res = await GET(req);

        expect(res.status).toBe(401);
        expect(res.headers.get('content-type')).toContain('application/problem+json');
        const body = await res.json();
        expect(body.title).toBe('Unauthorized');
        expect(body.detail).toBe('API Key tidak valid');
    });

    it('returns 403 Problem Details when user is not approved', async () => {
        vi.mocked(authenticateApiRequest).mockResolvedValue({
            ok: false,
            status: 403,
            title: 'Forbidden',
            detail: 'Akses API belum disetujui.',
        });

        const req = new Request('http://localhost:3000/api/v1/stock');
        const res = await GET(req);

        expect(res.status).toBe(403);
        expect(res.headers.get('content-type')).toContain('application/problem+json');
        const body = await res.json();
        expect(body.status).toBe(403);
        expect(body.detail).toBe('Akses API belum disetujui.');
    });

    it('returns 429 Problem Details with Retry-After header and retryAt when rate limited', async () => {
        vi.mocked(authenticateApiRequest).mockResolvedValue({
            ok: false,
            status: 429,
            title: 'Too Many Requests',
            detail: 'Batas pemanggilan API terlampaui.',
            retryAfterSeconds: 275,
            retryAt: '2026-10-11T12:05:00.000Z',
        });

        const req = new Request('http://localhost:3000/api/v1/stock');
        const res = await GET(req);

        expect(res.status).toBe(429);
        expect(res.headers.get('Retry-After')).toBe('275');
        expect(res.headers.get('content-type')).toContain('application/problem+json');
        const body = await res.json();
        expect(body.retryAt).toBe('2026-10-11T12:05:00.000Z');
    });

    it('returns 200 with data and meta when authorized and within rate limit', async () => {
        vi.mocked(authenticateApiRequest).mockResolvedValue({
            ok: true,
            user: {
                id: 'user-1',
                nik: '12345',
                name: 'Staff Test',
                email: 'staff@example.com',
                appr_api: true,
            },
        });

        const mockStock = [
            {
                branch: 'Lamongan',
                warehouse: 'SO Lamongan',
                material_code: 'MAT-01',
                designator: 'Closure 144',
                qty_stock: 50,
            },
        ];
        vi.mocked(getStockBalancesForApiUser).mockResolvedValue(mockStock);

        const req = new Request('http://localhost:3000/api/v1/stock');
        const res = await GET(req);

        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toContain('private');
        expect(res.headers.get('cache-control')).toContain('no-cache');
        const body = await res.json();
        expect(body.data).toEqual(mockStock);
        expect(body.meta.total).toBe(1);
        expect(body.meta.timestamp).toBeTruthy();
    });
});
