import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireTechnicianManagementAccess = vi.fn();
const mockRevalidatePath = vi.fn();
const mockUpdateExecute = vi.fn();
const mockInsertExecute = vi.fn();
const mockSet = vi
    .fn()
    .mockReturnValue({ where: vi.fn().mockReturnValue({ execute: mockUpdateExecute }) });
const mockValues = vi.fn().mockReturnValue({ execute: mockInsertExecute });

vi.mock('@/lib/auth-server', () => ({
    requireTechnicianManagementAccess: () => mockRequireTechnicianManagementAccess(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: (path: string) => mockRevalidatePath(path),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
    },
}));

vi.mock('@/lib/repositories/hr.repository', () => ({
    hrRepository: {
        getTechnicians: vi.fn(),
        getBranches: vi.fn(),
        getMitras: vi.fn(),
    },
}));

const mockSelectExecute = vi.fn();

vi.mock('@/lib/db/db', () => ({
    db: {
        updateTable: vi.fn(() => ({
            set: mockSet,
        })),
        insertInto: vi.fn(() => ({
            values: mockValues,
        })),
        selectFrom: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            execute: mockSelectExecute,
        })),
    },
}));

const { upsertTechnician, getWarehouses, updateTechnicianExclude, getMaterialsForSelect } =
    await import('@/app/(DashboardLayout)/management/technician/actions');

describe('technician-actions Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireTechnicianManagementAccess.mockResolvedValue({
            id: '1',
            role: 'Admin',
            nik: 'ADMIN01',
        });
        mockUpdateExecute.mockResolvedValue({});
        mockInsertExecute.mockResolvedValue({});
        mockSelectExecute.mockResolvedValue([
            { id: 1, name: 'Gudang A', branch: 'SBY' },
            { id: 2, name: 'Gudang B', branch: 'GSK' },
        ]);
    });

    it('trims whitespace from nik and name on insert', async () => {
        const result = await upsertTechnician({
            nik: '  12345678  ',
            name: '  Budi Santoso  ',
            branch_id: 1,
            mitra_id: null,
            wh_id: 5,
        });

        expect(result.success).toBe(true);
        expect(mockValues).toHaveBeenCalledWith({
            nik: '12345678',
            name: 'Budi Santoso',
            branch_id: 1,
            mitra_id: null,
            wh_id: 5,
        });
        expect(mockRevalidatePath).toHaveBeenCalledWith('/management/technician');
    });

    it('trims whitespace on update when id is provided', async () => {
        const result = await upsertTechnician({
            id: 10,
            nik: ' 98765432 ',
            name: ' Andi Pratama ',
            branch_id: 2,
            mitra_id: 3,
            wh_id: 7,
        });

        expect(result.success).toBe(true);
        expect(mockSet).toHaveBeenCalledWith({
            nik: '98765432',
            name: 'Andi Pratama',
            branch_id: 2,
            mitra_id: 3,
            wh_id: 7,
        });
    });

    it('rejects empty nik after trim', async () => {
        await expect(
            upsertTechnician({
                nik: '   ',
                name: 'Teknisi Test',
                branch_id: null,
                mitra_id: null,
                wh_id: 1,
            })
        ).rejects.toThrow('NIK wajib diisi');
    });

    it('rejects empty name after trim', async () => {
        await expect(
            upsertTechnician({
                nik: '12345678',
                name: '   ',
                branch_id: null,
                mitra_id: null,
                wh_id: 1,
            })
        ).rejects.toThrow('Nama teknisi wajib diisi');
    });

    it('rejects missing or non-positive wh_id', async () => {
        await expect(
            upsertTechnician({
                nik: '12345678',
                name: 'Teknisi Test',
                branch_id: null,
                mitra_id: null,
                wh_id: 0,
            })
        ).rejects.toThrow('Gudang wajib dipilih');
    });

    it('handles duplicate NIK error (23505) with user-friendly message', async () => {
        mockInsertExecute.mockRejectedValueOnce({ code: '23505' });

        await expect(
            upsertTechnician({
                nik: '12345678',
                name: 'Budi Santoso',
                branch_id: null,
                mitra_id: null,
                wh_id: 1,
            })
        ).rejects.toThrow('NIK tersebut sudah terdaftar pada teknisi lain.');
    });

    it('retrieves warehouses correctly', async () => {
        const warehouses = await getWarehouses();
        expect(warehouses).toHaveLength(2);
        expect(warehouses[0].name).toBe('Gudang A');
    });

    describe('updateTechnicianExclude', () => {
        it('successfully updates exclude items for non-staff user', async () => {
            mockRequireTechnicianManagementAccess.mockResolvedValueOnce({
                id: '1',
                role: 'Admin',
                isStaff: false,
            });

            const res = await updateTechnicianExclude({
                id: 15,
                items: [
                    {
                        id_material: 'MAT-01',
                        nama_material: 'Fiber Cable',
                        qty: 5,
                    },
                ],
            });

            expect(res.success).toBe(true);
            expect(res.message).toContain('Berhasil memperbarui 1 material exclude');
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    exclude_intech_lensa: expect.anything(),
                })
            );
            expect(mockRevalidatePath).toHaveBeenCalledWith('/management/technician');
            expect(mockRevalidatePath).toHaveBeenCalledWith('/reference/stock-comparison');
        });

        it('rejects staff user with access denied error', async () => {
            mockRequireTechnicianManagementAccess.mockResolvedValueOnce({
                id: '2',
                role: 'Staff',
                isStaff: true,
            });

            await expect(
                updateTechnicianExclude({
                    id: 15,
                    items: [],
                })
            ).rejects.toThrow('Hanya non-staff');
        });

        it('validates invalid item data (negative qty)', async () => {
            mockRequireTechnicianManagementAccess.mockResolvedValueOnce({
                id: '1',
                role: 'Admin',
                isStaff: false,
            });

            await expect(
                updateTechnicianExclude({
                    id: 15,
                    items: [
                        {
                            id_material: 'MAT-01',
                            nama_material: 'Fiber Cable',
                            qty: -2,
                        },
                    ],
                })
            ).rejects.toThrow('Jumlah harus lebih dari 0');
        });
    });

    describe('getMaterialsForSelect', () => {
        it('retrieves and maps materials correctly', async () => {
            mockSelectExecute.mockResolvedValueOnce([
                { code: 'C-01', description: 'Patchcord', unit: 'EA' },
            ]);

            const materials = await getMaterialsForSelect();
            expect(materials).toEqual([{ code: 'C-01', description: 'Patchcord', unit: 'EA' }]);
        });
    });
});
