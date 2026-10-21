import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/db';
import { authenticateApiRequest } from '@/lib/security/api-auth';
import { hashApiKey } from '@/lib/security/api-key';
import { checkAndConsumeApiRateLimit } from '@/lib/security/api-rate-limit';

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn(),
    },
}));

vi.mock('@/lib/security/api-rate-limit', () => ({
    checkAndConsumeApiRateLimit: vi.fn(),
}));

describe('authenticateApiRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 401 when Authorization header is missing', async () => {
        const req = new Request('http://localhost:3000/api/v1/stock');
        const result = await authenticateApiRequest(req);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(401);
            expect(result.title).toBe('Unauthorized');
        }
    });

    it('returns 401 when Authorization is not Bearer', async () => {
        const req = new Request('http://localhost:3000/api/v1/stock', {
            headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        });
        const result = await authenticateApiRequest(req);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(401);
        }
    });

    it('returns 401 when API key format is invalid', async () => {
        const req = new Request('http://localhost:3000/api/v1/stock', {
            headers: { Authorization: 'Bearer invalid_format_key' },
        });
        const result = await authenticateApiRequest(req);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(401);
            expect(result.detail).toContain('mtms_live_');
        }
    });

    it('returns 401 when API key does not match any user in DB', async () => {
        const rawKey = 'mtms_live_1111222233334444555566667777888899990000';
        const req = new Request('http://localhost:3000/api/v1/stock', {
            headers: { Authorization: `Bearer ${rawKey}` },
        });

        const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null);
        const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst });
        const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
        vi.mocked(db.selectFrom).mockReturnValue({ select: mockSelect } as any);

        const result = await authenticateApiRequest(req);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(401);
            expect(result.detail).toContain('tidak valid');
        }
        expect(mockWhere).toHaveBeenCalledWith('api_key', '=', hashApiKey(rawKey));
    });

    it('returns 429 when rate limit is exceeded for the user', async () => {
        const rawKey = 'mtms_live_1111222233334444555566667777888899990000';
        const req = new Request('http://localhost:3000/api/v1/stock', {
            headers: { Authorization: `Bearer ${rawKey}` },
        });

        const mockUser = {
            id: 'user-abc',
            nik: '12345',
            name: 'Test User',
            email: 'test@example.com',
            appr_api: true,
        };

        const mockExecuteTakeFirst = vi.fn().mockResolvedValue(mockUser);
        const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst });
        const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
        vi.mocked(db.selectFrom).mockReturnValue({ select: mockSelect } as any);

        vi.mocked(checkAndConsumeApiRateLimit).mockResolvedValue({
            allowed: false,
            retryAfterSeconds: 200,
            retryAt: '2026-10-11T12:05:00.000Z',
        });

        const result = await authenticateApiRequest(req);

        expect(result.ok).toBe(false);
        if (!result.ok && result.status === 429) {
            expect(result.status).toBe(429);
            expect(result.retryAfterSeconds).toBe(200);
            expect(result.retryAt).toBe('2026-10-11T12:05:00.000Z');
        }
    });

    it('returns 403 when user is found and rate limit is ok, but appr_api is false', async () => {
        const rawKey = 'mtms_live_1111222233334444555566667777888899990000';
        const req = new Request('http://localhost:3000/api/v1/stock', {
            headers: { Authorization: `Bearer ${rawKey}` },
        });

        const mockUser = {
            id: 'user-abc',
            nik: '12345',
            name: 'Test User',
            email: 'test@example.com',
            appr_api: false, // NOT approved
        };

        const mockExecuteTakeFirst = vi.fn().mockResolvedValue(mockUser);
        const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst });
        const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
        vi.mocked(db.selectFrom).mockReturnValue({ select: mockSelect } as any);

        vi.mocked(checkAndConsumeApiRateLimit).mockResolvedValue({
            allowed: true,
            retryAfterSeconds: 0,
            retryAt: null,
        });

        const result = await authenticateApiRequest(req);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(403);
            expect(result.title).toBe('Forbidden');
            expect(result.detail).toContain('belum disetujui');
        }
    });

    it('returns ok: true with user when key is valid, rate limit ok, and appr_api is true', async () => {
        const rawKey = 'mtms_live_1111222233334444555566667777888899990000';
        const req = new Request('http://localhost:3000/api/v1/stock', {
            headers: { Authorization: `Bearer ${rawKey}` },
        });

        const mockUser = {
            id: 'user-abc',
            nik: '12345',
            name: 'Test User',
            email: 'test@example.com',
            appr_api: true,
        };

        const mockExecuteTakeFirst = vi.fn().mockResolvedValue(mockUser);
        const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst });
        const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
        vi.mocked(db.selectFrom).mockReturnValue({ select: mockSelect } as any);

        vi.mocked(checkAndConsumeApiRateLimit).mockResolvedValue({
            allowed: true,
            retryAfterSeconds: 0,
            retryAt: null,
        });

        const result = await authenticateApiRequest(req);

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.user.id).toBe('user-abc');
            expect(result.user.appr_api).toBe(true);
        }
    });
});
