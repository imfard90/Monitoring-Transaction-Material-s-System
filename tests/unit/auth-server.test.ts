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

vi.mock('@/lib/redis', () => ({
    redis: {
        get: vi.fn().mockResolvedValue(null),
        pipeline: vi.fn().mockReturnValue({ set: vi.fn(), exec: vi.fn().mockResolvedValue([]) }),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
    },
}));

vi.mock('@/lib/presence', () => ({
    touchUserPresence: vi.fn().mockResolvedValue(undefined),
}));

const {
    getSessionNik,
    getSessionUser,
    requireManagementAccess,
    requireTechnicianManagementAccess,
    requireWarehouseAccess,
} = await import('@/lib/auth-server');
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
        execute: vi.fn().mockResolvedValue(warehouseIds.map((id) => ({ id }))),
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

describe('requireTechnicianManagementAccess', () => {
    it('allows Staff role (Staff can open & manage technicians)', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK004', 'Staff'));
        mockDbReturns('Staff');
        const user = await requireTechnicianManagementAccess();
        expect(user.role).toBe('Staff');
    });

    it('blocks Teknisi role (Teknisi cannot open or manage)', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK005', 'Teknisi'));
        mockDbReturns('Teknisi');
        await expect(requireTechnicianManagementAccess()).rejects.toThrow(AuthorizationError);
    });

    it('blocks null role (fail-closed)', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('NIK006', null));
        mockDbReturns(null);
        await expect(requireTechnicianManagementAccess()).rejects.toThrow(AuthorizationError);
    });

    it('blocks when session invalid (fail-closed)', async () => {
        mockAuthGetSession.mockResolvedValue(null);
        await expect(requireTechnicianManagementAccess()).rejects.toThrow(AuthenticationError);
    });

    it('allows Administrator role', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('ADM01', 'Administrator'));
        mockDbReturns('Administrator');
        const user = await requireTechnicianManagementAccess();
        expect(user.role).toBe('Administrator');
    });

    it('allows Supervisor role', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('SUP01', 'Supervisor'));
        mockDbReturns('Supervisor');
        const user = await requireTechnicianManagementAccess();
        expect(user.role).toBe('Supervisor');
    });
});

describe('requireWarehouseAccess', () => {
    it('allows non-Staff role (e.g. Administrator) to access any warehouse', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('ADM01', 'Administrator'));
        mockDbReturns('Administrator');
        const user = await requireWarehouseAccess(99);
        expect(user.isStaff).toBe(false);
        expect(user.role).toBe('Administrator');
    });

    it('allows Staff when target warehouse is in their assigned warehouseIds', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('STF01', 'Staff'));
        mockDbReturns('Staff', [5, 10, 15]);
        const user = await requireWarehouseAccess(10);
        expect(user.isStaff).toBe(true);
        expect(user.warehouseIds).toEqual([5, 10, 15]);
    });

    it('throws AuthorizationError when Staff has empty warehouseIds (fail-closed)', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('STF02', 'Staff'));
        mockDbReturns('Staff', []);
        await expect(requireWarehouseAccess(10)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthorizationError when Staff attempts to access unassigned warehouse', async () => {
        mockAuthGetSession.mockResolvedValue(makeSession('STF03', 'Staff'));
        mockDbReturns('Staff', [1, 2]);
        await expect(requireWarehouseAccess(10)).rejects.toThrow(AuthorizationError);
    });

    it('throws AuthenticationError when session is invalid', async () => {
        mockAuthGetSession.mockResolvedValue(null);
        await expect(requireWarehouseAccess(10)).rejects.toThrow(AuthenticationError);
    });

    it('returns cached session metadata from Redis without querying database', async () => {
        const { redis } = await import('@/lib/redis');
        mockAuthGetSession.mockResolvedValue(makeSession('CACHE01', 'Staff'));
        vi.mocked(redis.get).mockResolvedValueOnce(
            JSON.stringify({
                role: 'Staff',
                warehouseIds: [10, 20],
                isStaff: true,
                branchId: 1,
                branchName: 'Surabaya',
            })
        );

        mockDbQuery.mockClear();
        const user = await getSessionUser();

        expect(user.nik).toBe('CACHE01');
        expect(user.role).toBe('Staff');
        expect(user.warehouseIds).toEqual([10, 20]);
        expect(mockDbQuery).not.toHaveBeenCalled();
    });
});
