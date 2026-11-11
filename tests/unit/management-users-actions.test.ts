import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    checkIsStaff,
    getSidebarUserAccess,
    getUsers,
    isUserOnline,
} from '@/app/(DashboardLayout)/management/users/actions';
import { getSessionUser, requireManagementAccess } from '@/lib/auth-server';
import { db } from '@/lib/db/db';
import * as presenceModule from '@/lib/presence';

vi.mock('@/lib/redis', () => ({
    redis: {
        mget: vi.fn(),
    },
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: vi.fn(),
    requireManagementAccess: vi.fn(),
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn(),
    },
}));

describe('management/users/actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkIsStaff and getSidebarUserAccess', () => {
        it('returns user access flags when authenticated', async () => {
            vi.mocked(getSessionUser).mockResolvedValue({
                nik: 'STF001',
                role: 'Staff',
                isStaff: true,
                warehouseIds: [1],
                branchId: null,
                branchName: null,
            } as any);

            expect(await checkIsStaff()).toBe(true);

            const access = await getSidebarUserAccess();
            expect(access.isStaff).toBe(true);
            expect(access.isTeknisi).toBe(false);
        });

        it('fails closed when session fails', async () => {
            vi.mocked(getSessionUser).mockRejectedValue(new Error('No session'));

            expect(await checkIsStaff()).toBe(true);

            const access = await getSidebarUserAccess();
            expect(access.isStaff).toBe(true);
            expect(access.isTeknisi).toBe(true);
        });
    });

    describe('getUsers with batch presence', () => {
        it('fetches users and resolves presence in a single batch', async () => {
            vi.mocked(requireManagementAccess).mockResolvedValue(undefined as any);

            const mockUsers = [
                { id: '1', name: 'Alice', email: 'alice@test.com', nik: 'NIK001', is_active: true },
                { id: '2', name: 'Bob', email: 'bob@test.com', nik: 'NIK002', is_active: true },
                { id: '3', name: 'Charlie', email: 'charlie@test.com', nik: null, is_active: false },
            ];

            const mockOrderBy = vi.fn().mockReturnValue({
                execute: vi.fn().mockResolvedValue(mockUsers),
            });
            const mockSelect = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
            const mockJoin2 = vi.fn().mockReturnValue({ select: mockSelect });
            const mockJoin1 = vi.fn().mockReturnValue({ leftJoin: mockJoin2 });

            vi.mocked(db.selectFrom).mockReturnValue({
                leftJoin: mockJoin1,
            } as any);

            const batchSpy = vi
                .spyOn(presenceModule, 'batchGetUsersOnlineStatus')
                .mockResolvedValue(new Map([['NIK001', true], ['NIK002', false]]));

            const result = await getUsers();

            expect(requireManagementAccess).toHaveBeenCalled();
            expect(batchSpy).toHaveBeenCalledWith(expect.anything(), ['NIK001', 'NIK002']);
            expect(result).toHaveLength(3);
            expect(result[0].is_online).toBe(true);
            expect(result[1].is_online).toBe(false);
            expect(result[2].is_online).toBe(false);
        });
    });

    describe('isUserOnline', () => {
        it('checks online status via batch presence lookup and enforces management auth', async () => {
            vi.mocked(requireManagementAccess).mockResolvedValue(undefined as any);
            vi.spyOn(presenceModule, 'batchGetUsersOnlineStatus').mockResolvedValue(
                new Map([['NIK001', true]])
            );

            const online = await isUserOnline('NIK001');
            expect(requireManagementAccess).toHaveBeenCalled();
            expect(online).toBe(true);
        });
    });
});

