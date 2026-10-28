import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelectFrom = vi.fn();
const mockSqlExecute = vi.fn().mockResolvedValue({ rows: [] });
const mockSql = vi.fn(() => ({
    execute: mockSqlExecute,
}));

vi.mock('kysely', () => ({
    sql: mockSql,
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: mockDbSelectFrom,
    },
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: vi.fn().mockResolvedValue({
        nik: '12345',
        role: 'Staff',
        isStaff: true,
        warehouseIds: [1],
    }),
}));

const mockRedisGet = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisScan = vi.fn();

vi.mock('@/lib/redis', () => ({
    redis: {
        get: mockRedisGet,
        del: mockRedisDel,
        scan: mockRedisScan,
    },
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: { error: vi.fn(), info: vi.fn() },
}));

const { precheckLogin, revokeAllUserSessions, logoutUser } = await import(
    '@/app/auth/login/_actions/login-actions'
);

describe('login-actions: precheckLogin & revokeAllUserSessions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('precheckLogin', () => {
        it('rejects missing or invalid turnstile token', async () => {
            const res = await precheckLogin('test@example.com', '');
            expect(res).toEqual({ status: 'turnstile_failed' });
        });

        it('rejects invalid email format', async () => {
            const res = await precheckLogin('invalid-email', 'valid-turnstile-token');
            expect(res).toEqual({ status: 'error' });
        });

        it('returns not_found when user does not exist in DB', async () => {
            mockDbSelectFrom.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue(null),
            });

            const res = await precheckLogin('test@example.com', 'valid-turnstile-token');
            expect(res).toEqual({ status: 'not_found' });
        });

        it('returns inactive when user is inactive', async () => {
            mockDbSelectFrom.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 'u1',
                    nik: '12345',
                    is_active: false,
                }),
            });

            const res = await precheckLogin('test@example.com', 'valid-turnstile-token');
            expect(res).toEqual({ status: 'inactive' });
        });

        it('returns active_session_exists when presence index is active', async () => {
            mockDbSelectFrom.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 'u1',
                    nik: '12345',
                    is_active: true,
                }),
            });

            mockRedisGet.mockResolvedValueOnce('1'); // presence:index:12345

            const res = await precheckLogin('test@example.com', 'valid-turnstile-token');
            expect(res).toEqual({ status: 'active_session_exists' });
            expect(mockRedisGet).toHaveBeenCalledWith('presence:index:12345');
        });

        it('returns active_session_exists when active-sessions exist in Redis', async () => {
            mockDbSelectFrom.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 'u1',
                    nik: '12345',
                    is_active: true,
                }),
            });

            mockRedisGet
                .mockResolvedValueOnce(null) // presence:index:12345 is null
                .mockResolvedValueOnce(
                    JSON.stringify([
                        { token: 'token-abc', expiresAt: Date.now() + 100000 },
                    ])
                ); // active-sessions-u1

            const res = await precheckLogin('test@example.com', 'valid-turnstile-token');
            expect(res).toEqual({ status: 'active_session_exists' });
        });

        it('returns ok when user is active and has no conflicting sessions', async () => {
            mockDbSelectFrom.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 'u1',
                    nik: '12345',
                    is_active: true,
                }),
            });

            mockRedisGet.mockResolvedValue(null);
            mockSqlExecute.mockResolvedValueOnce({ rows: [] });

            const res = await precheckLogin('test@example.com', 'valid-turnstile-token');
            expect(res).toEqual({ status: 'ok' });
        });
    });

    describe('revokeAllUserSessions', () => {
        it('clears presence, deletes Redis sessions and purges DB session table', async () => {
            mockDbSelectFrom.mockReturnValue({
                select: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({
                    id: 'u1',
                    nik: '12345',
                }),
            });

            mockRedisGet.mockResolvedValueOnce(
                JSON.stringify([{ token: 'token-1' }, { token: 'token-2' }])
            );
            mockRedisScan.mockResolvedValueOnce(['0', []]);
            mockSqlExecute.mockResolvedValueOnce({ rows: [] });

            const res = await revokeAllUserSessions('test@example.com');
            expect(res).toEqual({ success: true });
            expect(mockRedisDel).toHaveBeenCalledWith('presence:index:12345');
            expect(mockRedisDel).toHaveBeenCalledWith('token-1', 'token-2');
            expect(mockRedisDel).toHaveBeenCalledWith('active-sessions-u1');
            expect(mockSqlExecute).toHaveBeenCalled();
        });
    });

    describe('logoutUser', () => {
        it('clears presence when user session exists', async () => {
            mockRedisScan.mockResolvedValueOnce(['0', []]);
            await logoutUser();
            expect(mockRedisDel).toHaveBeenCalledWith('presence:index:12345');
        });
    });
});
