import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    deleteUserApiKey,
    generateUserApiKey,
} from '@/app/(DashboardLayout)/user-profile/_actions/profile-actions';
import { toggleUserApiApproval } from '@/app/(DashboardLayout)/management/users/actions';
import { getSessionNik, requireManagementAccess } from '@/lib/auth-server';
import { db } from '@/lib/db/db';

vi.mock('@/lib/redis', () => ({
    redis: {
        mget: vi.fn(),
    },
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionNik: vi.fn(),
    requireManagementAccess: vi.fn(),
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn(),
        updateTable: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

describe('User Profile API Key Actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('generateUserApiKey returns Unauthorized when session is invalid', async () => {
        vi.mocked(getSessionNik).mockResolvedValue(null as any);

        const res = await generateUserApiKey();
        expect(res.success).toBe(false);
        expect(res.error).toBe('Unauthorized');
    });

    it('generateUserApiKey prevents generation if key already exists', async () => {
        vi.mocked(getSessionNik).mockResolvedValue('12345');

        const mockExecuteTakeFirst = vi.fn().mockResolvedValue({
            id: 'user-1',
            api_key: 'existing_hash_key',
        });
        const mockWhere = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst });
        const mockSelect = vi.fn().mockReturnValue({ where: mockWhere });
        vi.mocked(db.selectFrom).mockReturnValue({ select: mockSelect } as any);

        const res = await generateUserApiKey();
        expect(res.success).toBe(false);
        expect(res.error).toContain('Hapus API Key lama terlebih dahulu');
    });

    it('generateUserApiKey generates key and resets appr_api to false', async () => {
        vi.mocked(getSessionNik).mockResolvedValue('12345');

        // User currently has no api_key
        const mockExecuteTakeFirst = vi.fn().mockResolvedValue({
            id: 'user-1',
            api_key: null,
        });
        const mockWhereSelect = vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst });
        const mockSelect = vi.fn().mockReturnValue({ where: mockWhereSelect });
        vi.mocked(db.selectFrom).mockReturnValue({ select: mockSelect } as any);

        const mockExecuteUpdate = vi.fn().mockResolvedValue(undefined);
        const mockWhereUpdate = vi.fn().mockReturnValue({ execute: mockExecuteUpdate });
        const mockSet = vi.fn().mockReturnValue({ where: mockWhereUpdate });
        vi.mocked(db.updateTable).mockReturnValue({ set: mockSet } as any);

        const res = await generateUserApiKey();
        expect(res.success).toBe(true);
        expect(res.data?.rawKey).toMatch(/^mtms_live_[a-f0-9]{64}$/);

        expect(mockSet).toHaveBeenCalledWith(
            expect.objectContaining({
                appr_api: false,
            })
        );
    });

    it('deleteUserApiKey sets api_key to null and appr_api to false', async () => {
        vi.mocked(getSessionNik).mockResolvedValue('12345');

        const mockExecuteUpdate = vi.fn().mockResolvedValue(undefined);
        const mockWhereUpdate = vi.fn().mockReturnValue({ execute: mockExecuteUpdate });
        const mockSet = vi.fn().mockReturnValue({ where: mockWhereUpdate });
        vi.mocked(db.updateTable).mockReturnValue({ set: mockSet } as any);

        const res = await deleteUserApiKey();
        expect(res.success).toBe(true);
        expect(mockSet).toHaveBeenCalledWith({
            api_key: null,
            appr_api: false,
        });
    });
});

describe('User Management API Approval Action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('toggleUserApiApproval enforces requireManagementAccess', async () => {
        vi.mocked(requireManagementAccess).mockRejectedValue(new Error('Access Denied'));

        await expect(toggleUserApiApproval('user-1', true)).rejects.toThrow('Access Denied');
        expect(requireManagementAccess).toHaveBeenCalled();
    });

    it('toggleUserApiApproval updates appr_api for the specified user', async () => {
        vi.mocked(requireManagementAccess).mockResolvedValue({
            nik: 'admin-1',
            role: 'Admin',
            warehouseIds: [],
            isStaff: false,
            branchId: 1,
            branchName: 'Surabaya',
        });

        const mockExecute = vi.fn().mockResolvedValue(undefined);
        const mockWhere = vi.fn().mockReturnValue({ execute: mockExecute });
        const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
        vi.mocked(db.updateTable).mockReturnValue({ set: mockSet } as any);

        await toggleUserApiApproval('user-target', true);

        expect(mockSet).toHaveBeenCalledWith({ appr_api: true });
        expect(mockWhere).toHaveBeenCalledWith('id', '=', 'user-target');
    });
});
