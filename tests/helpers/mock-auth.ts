import { vi } from 'vitest';

/**
 * Mocks for `src/lib/auth-server.ts` used by server-action unit tests.
 *
 * P1-Q1: Test harness setup.
 */

export interface MockSessionUser {
    nik: string;
    role: string | null;
    warehouseIds: number[];
    isStaff: boolean;
    branchId: number | null;
    branchName: string | null;
}

export const ADMIN_USER: MockSessionUser = {
    nik: 'ADM001',
    role: 'Administrator',
    warehouseIds: [],
    isStaff: false,
    branchId: 1,
    branchName: 'HQ',
};

export const STAFF_USER: MockSessionUser = {
    nik: 'STF001',
    role: 'Staff',
    warehouseIds: [10, 11],
    isStaff: true,
    branchId: 2,
    branchName: 'Branch A',
};

export const TEKNISI_USER: MockSessionUser = {
    nik: 'TKN001',
    role: 'Teknisi',
    warehouseIds: [],
    isStaff: false,
    branchId: 2,
    branchName: 'Branch A',
};

/**
 * Install mocks for the auth-server module.
 * Returns helpers to change the current user / simulate no session.
 */
export function mockAuthServer(initial: MockSessionUser = ADMIN_USER) {
    let currentUser: MockSessionUser | null = initial;
    let shouldThrow = false;

    const getSessionUser = vi.fn(async (): Promise<MockSessionUser> => {
        if (shouldThrow || !currentUser) throw new Error('AuthenticationError');
        return currentUser;
    });

    const getSessionNik = vi.fn(async (): Promise<string> => {
        if (shouldThrow || !currentUser) throw new Error('AuthenticationError');
        return currentUser.nik;
    });

    const requireManagementAccess = vi.fn(async (): Promise<MockSessionUser> => {
        if (shouldThrow || !currentUser) throw new Error('AuthenticationError');
        const blocked = new Set(['Staff', 'Teknisi']);
        if (!currentUser.role || blocked.has(currentUser.role)) {
            throw new Error('AuthorizationError');
        }
        return currentUser;
    });

    vi.mock('@/lib/auth-server', () => ({
        getSessionUser,
        getSessionNik,
        requireManagementAccess,
        SessionUser: {} as any,
    }));

    return {
        getSessionUser,
        getSessionNik,
        requireManagementAccess,
        setUser(u: MockSessionUser | null) {
            currentUser = u;
            shouldThrow = false;
        },
        reject() {
            shouldThrow = true;
        },
        reset() {
            currentUser = initial;
            shouldThrow = false;
            getSessionUser.mockClear();
            getSessionNik.mockClear();
            requireManagementAccess.mockClear();
        },
    };
}
