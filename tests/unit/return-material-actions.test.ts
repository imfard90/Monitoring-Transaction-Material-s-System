import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionNik = vi.fn();
const mockRequireWarehouseAccess = vi.fn();
const mockCheckAndStoreIdempotency = vi.fn();
const mockInventoryRepoCreateReturnRequest = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('next/cache', () => ({
    revalidatePath: (path: string) => mockRevalidatePath(path),
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionNik: () => mockGetSessionNik(),
    getSessionUser: vi.fn(),
    requireWarehouseAccess: (targetWarehouseId: number) =>
        mockRequireWarehouseAccess(targetWarehouseId),
}));

vi.mock('@/lib/security/idempotency', () => ({
    checkAndStoreIdempotency: (key: string, data: any, callback: any) =>
        mockCheckAndStoreIdempotency(key, data, callback),
}));

vi.mock('@/lib/repositories/inventory.repository', () => ({
    inventoryRepository: {
        createReturnRequest: (params: any) => mockInventoryRepoCreateReturnRequest(params),
    },
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: () => ({
            innerJoin: () => ({
                leftJoin: () => ({
                    select: () => ({
                        where: () => ({
                            whereRef: () => ({
                                distinct: () => ({
                                    execute: vi.fn().mockResolvedValue([]),
                                }),
                            }),
                        }),
                    }),
                }),
            }),
        }),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
    },
}));

const { createReturnMaterial } = await import(
    '@/app/(DashboardLayout)/form/return-material/_actions/return-actions'
);

describe('return-material-actions Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionNik.mockResolvedValue('STAFF_01');
        mockRequireWarehouseAccess.mockResolvedValue({
            nik: 'STAFF_01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [1],
        });
        mockCheckAndStoreIdempotency.mockImplementation((_key, data, cb) =>
            cb(data).then((res: any) => ({ isDuplicate: false, result: res }))
        );
        mockInventoryRepoCreateReturnRequest.mockResolvedValue('TRX-RETURN-TKN01-KP-26100001');
    });

    const validPayload = {
        idemKey: 'idem-return-1',
        sap_out_id: 10,
        nik_teknisi: 'TKN001',
        warehouse_id: 1,
        notes: 'Material rusak saat instalasi',
        items: [
            {
                designator_id: 5,
                sap_out_item_id: 101,
                qty: 2,
            },
        ],
    };

    it('rejects when idemKey is missing', async () => {
        const res = await createReturnMaterial({
            ...validPayload,
            idemKey: '',
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Idempotency key required');
    });

    it('rejects when items array is empty', async () => {
        const res = await createReturnMaterial({
            ...validPayload,
            items: [],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Minimal satu material harus direturn');
    });

    it('rejects when qty is 0 or negative', async () => {
        const res = await createReturnMaterial({
            ...validPayload,
            items: [
                {
                    designator_id: 5,
                    sap_out_item_id: 101,
                    qty: -1,
                },
            ],
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Jumlah return harus lebih dari 0');
    });

    it('rejects when user does not have access to the target warehouse', async () => {
        mockRequireWarehouseAccess.mockRejectedValue(
            new Error('Akses ditolak: Anda tidak memiliki wewenang untuk gudang ini.')
        );

        const res = await createReturnMaterial(validPayload);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Akses ditolak');
        expect(mockInventoryRepoCreateReturnRequest).not.toHaveBeenCalled();
    });

    it('successfully calls inventoryRepository.createReturnRequest and revalidates paths', async () => {
        const res = await createReturnMaterial(validPayload);

        expect(res.success).toBe(true);
        expect(res.id_trx).toBe('TRX-RETURN-TKN01-KP-26100001');
        expect(mockRequireWarehouseAccess).toHaveBeenCalledWith(1);
        expect(mockInventoryRepoCreateReturnRequest).toHaveBeenCalledWith({
            sapOutId: 10,
            nikTeknisi: 'TKN001',
            warehouseId: 1,
            notes: 'Material rusak saat instalasi',
            items: validPayload.items,
            createdBy: 'STAFF_01',
        });
        expect(mockRevalidatePath).toHaveBeenCalledWith('/form/return-material');
        expect(mockRevalidatePath).toHaveBeenCalledWith('/stock-inventory');
    });

    it('detects duplicate idempotency request and returns warning', async () => {
        mockCheckAndStoreIdempotency.mockResolvedValue({
            isDuplicate: true,
            result: null,
        });

        const res = await createReturnMaterial(validPayload);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Transaksi ganda terdeteksi');
        expect(mockInventoryRepoCreateReturnRequest).not.toHaveBeenCalled();
    });

    it('catches and formats repository failure', async () => {
        mockInventoryRepoCreateReturnRequest.mockRejectedValue(
            new Error('Over-return: Jumlah return melebihi sisa alokasi material')
        );

        const res = await createReturnMaterial(validPayload);
        expect(res.success).toBe(false);
        expect(res.error).toContain('Over-return');
    });
});
