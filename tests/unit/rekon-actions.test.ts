import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockInventoryRepo = {
    getNewHasilRekon: vi.fn(),
    getOldHasilRekon: vi.fn(),
    getHasilRekonPaginated: vi.fn(),
    getHasilRekonFilterOptions: vi.fn(),
};

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/repositories/inventory.repository', () => ({
    inventoryRepository: mockInventoryRepo,
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
    },
}));

const { getNewHasilRekon, getHasilRekon, getHasilRekonPaginated, getHasilRekonFilterOptions } =
    await import('@/app/(DashboardLayout)/apps/hasil-rekon/_actions/rekon-actions');

describe('rekon-actions server actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getNewHasilRekon', () => {
        it('returns empty array when staff has no assigned warehouses', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF01',
                isStaff: true,
                warehouseIds: [],
            });

            const res = await getNewHasilRekon(0, 5);
            expect(res).toEqual([]);
            expect(mockInventoryRepo.getNewHasilRekon).not.toHaveBeenCalled();
        });

        it('delegates to repository with warehouse scoping when user is staff', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF01',
                isStaff: true,
                warehouseIds: [1, 2],
            });

            mockInventoryRepo.getNewHasilRekon.mockResolvedValueOnce([
                {
                    header_id: 1,
                    item_id: 10,
                    trx_id: 'TRX-01',
                    material_code: 'MAT-01',
                    qty: 5,
                },
            ]);

            const res = await getNewHasilRekon(0, 5);
            expect(res).toHaveLength(1);
            expect(res[0].trx_id).toBe('TRX-01');
            expect(mockInventoryRepo.getNewHasilRekon).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseIds: [1, 2],
                })
            );
        });

        it('delegates to repository without warehouse scoping when user is non-staff', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADMIN01',
                isStaff: false,
                warehouseIds: [],
            });

            mockInventoryRepo.getNewHasilRekon.mockResolvedValueOnce([]);

            const res = await getNewHasilRekon(0, 5);
            expect(res).toEqual([]);
            expect(mockInventoryRepo.getNewHasilRekon).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseIds: undefined,
                })
            );
        });
    });

    describe('getHasilRekon', () => {
        it('returns empty array when staff has no assigned warehouses', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF01',
                isStaff: true,
                warehouseIds: [],
            });

            const res = await getHasilRekon(0, 5);
            expect(res).toEqual([]);
            expect(mockInventoryRepo.getOldHasilRekon).not.toHaveBeenCalled();
        });

        it('delegates to repository with warehouse scoping for staff', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF01',
                isStaff: true,
                warehouseIds: [3],
            });

            mockInventoryRepo.getOldHasilRekon.mockResolvedValueOnce([
                {
                    header_id: 2,
                    item_id: 20,
                    trx_id: 'TRX-02',
                    material_code: 'MAT-02',
                    qty: 1,
                },
            ]);

            const res = await getHasilRekon(0, 5);
            expect(res).toHaveLength(1);
            expect(mockInventoryRepo.getOldHasilRekon).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseIds: [3],
                })
            );
        });
    });

    describe('getHasilRekonPaginated', () => {
        it('returns empty result fail-closed when staff has no warehouseIds', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF01',
                isStaff: true,
                warehouseIds: [],
            });

            const res = await getHasilRekonPaginated({ page: 1, pageSize: 20 });
            expect(res.success).toBe(true);
            expect(res.data.items).toEqual([]);
            expect(res.data.total).toBe(0);
            expect(mockInventoryRepo.getHasilRekonPaginated).not.toHaveBeenCalled();
        });

        it('delegates to repository and returns paginated result', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADMIN01',
                isStaff: false,
                warehouseIds: [],
            });

            mockInventoryRepo.getHasilRekonPaginated.mockResolvedValueOnce({
                items: [{ header_id: 1, trx_id: 'TRX-100' }],
                total: 1,
                page: 1,
                pageSize: 20,
                totalPages: 1,
            });

            const res = await getHasilRekonPaginated({ page: 1, pageSize: 20 });
            expect(res.success).toBe(true);
            expect(res.data.items).toHaveLength(1);
            expect(res.data.total).toBe(1);
        });
    });

    describe('getHasilRekonFilterOptions', () => {
        it('returns empty options fail-closed when staff has no warehouseIds', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'STAFF01',
                isStaff: true,
                warehouseIds: [],
            });

            const res = await getHasilRekonFilterOptions();
            expect(res.warehouses).toEqual([]);
            expect(mockInventoryRepo.getHasilRekonFilterOptions).not.toHaveBeenCalled();
        });

        it('delegates to repository for options', async () => {
            mockGetSessionUser.mockResolvedValueOnce({
                nik: 'ADMIN01',
                isStaff: false,
                warehouseIds: [],
            });

            mockInventoryRepo.getHasilRekonFilterOptions.mockResolvedValueOnce({
                warehouses: ['Gudang A'],
                materials: ['DC-01'],
                types: ['psb', 'lensa', 'mt', 'ro'],
            });

            const res = await getHasilRekonFilterOptions();
            expect(res.warehouses).toContain('Gudang A');
            expect(res.materials).toContain('DC-01');
        });
    });
});
