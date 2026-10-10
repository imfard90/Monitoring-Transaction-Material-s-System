import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for auth-server authorization guards (P1-Q1).
 *
 * Contract verified:
 *   - Blocked roles (Staff, Teknisi) → AuthorizationError
 *   - Null role → AuthorizationError (fail-closed)
 *   - Admin/Supervisor → resolves with SessionUser
 *   - Any internal error → AuthenticationError (fail-closed, no leak)
 *
 * Mocks: next/headers + auth.api + db chain so we can assert guard logic
 * without a live Next.js runtime or DB.
 */

const mockAuthGetSession = vi.fn();
const mockDbQuery = vi.fn();

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

const { getSessionNik, getSessionUser, requireManagementAccess } = await import(
    '@/lib/auth-server'
);
const { AuthenticationError, AuthorizationError } = await import('@/lib/errors');

function makeSession(nik?: string, role?: string | null) {
    return { user: { nik, role }, session: { id: 'sess1' } };
}

function mockDbReturns(role: string | null, warehouseIds: number[] = []) {
    const employee = role ? { level_name: role } : undefined;
    const chain = {
        leftJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(employee),
        execute: vi.fn().mockResolvedValue(
            warehouseIds.map((id) => ({ id }))
        ),
        or: vi.fn().mockReturnThis(),
    };
    mockDbQuery.mockImplementation(() => chain);
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getSessionNik', () => {
    it('returns NIK when session is valid', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK001'));
        const nik = await getSessionNik();
        expect(nik).toBe('NIK001');
    });

    it('throws AuthenticationError when session has no NIK', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession(undefined));
        await expect(getSessionNik()).rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError when getSession throws', async () => {
        mockAuthGetSession.mockRejectedValue(new Error('network'));
        await expect(getSessionNik()).rejects.toThrow(AuthenticationError);
    });
});

describe('getSessionUser', () => {
    it('returns SessionUser with role from hr.levels', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK001', 'Admin'));
        mockDbReturns('Admin');
        const user = await getSessionUser();
        expect(user.nik).toBe('NIK001');
        expect(user.role).toBe('Admin');
        expect(user.isStaff).toBe(false);
        expect(user.warehouseIds).toEqual([]);
    });

    it('returns warehouseIds for Staff role', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK002', 'Staff'));
        mockDbReturns('Staff', [10, 20]);
        const user = await getSessionUser();
        expect(user.isStaff).toBe(true);
        expect(user.warehouseIds).toEqual([10, 20]);
    });

    it('throws AuthenticationError when no session', async () => {
        mockAuthGetSession.mockResolvedValue(null);
        await expect(getSessionUser()).rejects.toThrow(AuthenticationError);
    });

    it('throws AuthenticationError when db query fails (fail-closed)', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK003', 'Admin'));
        mockDbQuery.mockImplementation(() => {
            throw new Error('db connection lost');
        });
        await expect(getSessionUser()).rejects.toThrow(AuthenticationError);
    });
});

describe('requireManagementAccess', () => {
    it('blocks Staff role', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK004', 'Staff'));
        mockDbReturns('Staff');
        await expect(requireManagementAccess()).rejects.toThrow(AuthorizationError);
    });

    it('blocks Teknisi role', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK005', 'Teknisi'));
        mockDbReturns('Teknisi');
        await expect(requireManagementAccess()).rejects.toThrow(AuthorizationError);
    });

    it('blocks null role (fail-closed)', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK006', null));
        mockDbReturns(null);
        await expect(requireManagementAccess()).rejects.toThrow(AuthorizationError);
    });

    it('blocks when session invalid (fail-closed)', async () => {
        mockAuthGetSession.mockResolvedValue(null);
        await expect(requireManagementAccess()).rejects.toThrow(AuthenticationError);
    });

    it('allows Administrator role', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('ADM01', 'Administrator'));
        mockDbReturns('Administrator');
        const user = await requireManagementAccess();
        expect(user.role).toBe('Administrator');
    });

    it('allows Supervisor role', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('SUP01', 'Supervisor'));
        mockDbReturns('Supervisor');
        const user = await requireManagementAccess();
        expect(user.role).toBe('Supervisor');
    });
});
