import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionNik = vi.fn();
const mockCheckAndStoreIdempotency = vi.fn();
const mockInventoryRepoCreateOutSap = vi.fn();
const mockInventoryRepoRecordSapOut = vi.fn();
const mockRevalidatePath = vi.fn();
const mockDbExecute = vi.fn();

vi.mock('next/cache', () => ({
    revalidatePath: (path: string) => mockRevalidatePath(path),
}));

const mockRequireWarehouseAccess = vi.fn();

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
        createOutSap: (params: any) => mockInventoryRepoCreateOutSap(params),
        recordSapOut: (params: any) => mockInventoryRepoRecordSapOut(params),
    },
}));

vi.mock('@/lib/repositories/hr.repository', () => ({
    hrRepository: {
        getTechnicians: vi.fn(),
    },
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        transaction: () => ({
            execute: (cb: any) => mockDbExecute(cb),
        }),
        selectFrom: () => ({
            selectAll: () => ({
                orderBy: () => ({
                    execute: vi.fn().mockResolvedValue([]),
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

const { createOutSap, updateOutSapStatusToIntech } = await import(
    '@/app/(DashboardLayout)/form/out-sap/_actions/out-sap-actions'
);

describe('out-sap-actions Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionNik.mockResolvedValue('STAFF_TEST_NIK');
        mockRequireWarehouseAccess.mockResolvedValue({
            nik: 'STAFF_TEST_NIK',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [1],
        });
        mockCheckAndStoreIdempotency.mockImplementation((_key, data, cb) =>
            cb(data).then((res: any) => ({ isDuplicate: false, result: res }))
        );
    });

    describe('createOutSap', () => {
        const validPayload = {
            idemKey: 'test-idem-key-1',
            warehouse_id: 1,
            nik_teknisi: 'TKN001',
            name_sa: 'SA-SURABAYA',
            id_reservasi: 'RES-001',
            sap_number: 'SAP-123456',
            request_id: 'REQ-001',
            items: [{ designator_id: 10, qty_req: 2, unit_price: 1500 }],
        };

        it('rejects when idemKey is missing', async () => {
            const res = await createOutSap({
                ...validPayload,
                idemKey: '',
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('Idempotency key required');
        });

        it('rejects when payload fails Zod schema validation', async () => {
            const res = await createOutSap({
                ...validPayload,
                warehouse_id: -1, // Invalid
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('Invalid input data');
        });

        it('delegates to inventoryRepository.createOutSap and returns result', async () => {
            mockInventoryRepoCreateOutSap.mockResolvedValueOnce({
                headerId: 88,
                idTrx: 'TRX-OUT-KP-TKN001-26100001',
            });

            const res = await createOutSap(validPayload);

            expect(res.success).toBe(true);
            expect(res.header_id).toBe(88);
            expect(res.id_trx).toBe('TRX-OUT-KP-TKN001-26100001');
            expect(mockInventoryRepoCreateOutSap).toHaveBeenCalledWith({
                warehouseId: 1,
                nikTeknisi: 'TKN001',
                nameSa: 'SA-SURABAYA',
                idReservasi: 'RES-001',
                sapNumber: 'SAP-123456',
                requestId: 'REQ-001',
                createdBy: 'STAFF_TEST_NIK',
                items: [{ designator_id: 10, qty_req: 2, unit_price: 1500 }],
            });
            expect(mockRevalidatePath).toHaveBeenCalledWith('/stock-intech');
            expect(mockRevalidatePath).toHaveBeenCalledWith('/stock-inventory');
            expect(mockRevalidatePath).toHaveBeenCalledWith('/apps/out-material');
        });

        it('detects duplicate idempotency request and returns warning', async () => {
            mockCheckAndStoreIdempotency.mockResolvedValueOnce({
                isDuplicate: true,
                result: null,
            });

            const res = await createOutSap(validPayload);

            expect(res.success).toBe(false);
            expect(res.error).toContain('Transaksi ganda terdeteksi');
        });

        it('catches and formats repository failure', async () => {
            mockInventoryRepoCreateOutSap.mockRejectedValueOnce(
                new Error('Stok tidak mencukupi di warehouse 1')
            );

            const res = await createOutSap(validPayload);

            expect(res.success).toBe(false);
            expect(res.error).toBe('Stok tidak mencukupi di warehouse 1');
        });
    });

    describe('updateOutSapStatusToIntech', () => {
        it('updates status and calls inventoryRepository.recordSapOut', async () => {
            mockDbExecute.mockImplementation(async (cb: any) => {
                const fakeTrx = {
                    updateTable: () => ({
                        set: () => ({
                            where: () => ({
                                execute: vi.fn(),
                            }),
                        }),
                    }),
                    selectFrom: () => ({
                        select: () => ({
                            where: () => ({
                                executeTakeFirst: vi.fn().mockResolvedValue({ warehouse_id: 5 }),
                            }),
                        }),
                    }),
                };
                return cb(fakeTrx);
            });

            mockInventoryRepoRecordSapOut.mockResolvedValueOnce({ rows: [] });

            const res = await updateOutSapStatusToIntech(10);

            expect(res.success).toBe(true);
            expect(mockInventoryRepoRecordSapOut).toHaveBeenCalledWith({
                headerId: 10,
                warehouseId: 5,
                createdBy: 'STAFF_TEST_NIK',
            });
            expect(mockRevalidatePath).toHaveBeenCalledWith('/stock-intech');
        });
    });
});
