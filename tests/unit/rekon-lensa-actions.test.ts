import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionNik = vi.fn();
const mockGetSessionUser = vi.fn();
const mockCheckAndStoreIdempotency = vi.fn();
const mockRecordRekonLensa = vi.fn();
const mockGenerateTrxUsedLensaSeq = vi.fn();
const mockMarkWoLensaReconciled = vi.fn();
const mockDbExecuteTakeFirst = vi.fn();
const mockDbExecute = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('next/cache', () => ({
    revalidatePath: (path: string) => mockRevalidatePath(path),
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionNik: () => mockGetSessionNik(),
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/security/idempotency', () => ({
    checkAndStoreIdempotency: (key: string, data: any, callback: any) =>
        mockCheckAndStoreIdempotency(key, data, callback),
}));

vi.mock('@/lib/repositories', () => ({
    createInventoryRepository: () => ({
        recordRekonLensa: (params: any) => mockRecordRekonLensa(params),
        generateTrxUsedLensaSeq: () => mockGenerateTrxUsedLensaSeq(),
        markWoLensaReconciled: (pemakaianId: string) => mockMarkWoLensaReconciled(pemakaianId),
    }),
}));

const createChain = () => {
    const chain: any = {
        select: vi.fn(() => chain),
        selectAll: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        groupBy: vi.fn(() => chain),
        execute: (...args: any[]) => mockDbExecute(...args),
        executeTakeFirst: (...args: any[]) => mockDbExecuteTakeFirst(...args),
    };
    return chain;
};

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: () => createChain(),
        transaction: () => ({
            execute: async (cb: any) =>
                cb({
                    selectFrom: () => ({
                        select: () => ({
                            where: () => ({
                                execute: vi.fn().mockResolvedValue([
                                    { id: 10, code: 'MAT-01' },
                                    { id: 20, code: 'MAT-02' },
                                ]),
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

const { submitRekonLensa, getWOLensa } = await import(
    '@/app/(DashboardLayout)/form/rekon-lensa/_actions/rekon-lensa-actions'
);

describe('rekon-lensa-actions Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionNik.mockResolvedValue('STAFF_01');
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF_01',
            role: 'Admin',
            isStaff: false,
            warehouseIds: [],
        });
        mockCheckAndStoreIdempotency.mockImplementation((_key, data, cb) =>
            cb(data).then((res: any) => ({ isDuplicate: false, result: res }))
        );
        mockDbExecuteTakeFirst.mockResolvedValue(null);
        mockDbExecute.mockResolvedValue([]);
        mockGenerateTrxUsedLensaSeq.mockResolvedValue('0012');
        mockRecordRekonLensa.mockResolvedValue({ rows: [] });
        mockMarkWoLensaReconciled.mockResolvedValue(undefined);
    });

    const validItem = {
        sap_out_id: '100',
        sap_number: 'SAP-2026-001',
        name_sa: 'SA-SBY',
        name_wh: 'WH-KAPASARI',
        designator_id: 10,
        sap_out_item_id: '501',
        qty: 1,
        wo_type: 'psb',
        wo_number: 'WO-LENSA-001',
        pemakaian_id: 'PEM-12345',
        notes: 'Rekon lensa test',
    };

    it('rejects when idemKey is empty', async () => {
        const res = await submitRekonLensa('TKN01', [validItem], '');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Idempotency key required');
    });

    it('rejects when items array is empty', async () => {
        const res = await submitRekonLensa('TKN01', [], 'idem-lensa-1');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Invalid input data');
    });

    it('rejects submission if Staff has no assigned warehouses (fail-closed)', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF_02',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [],
        });

        const res = await submitRekonLensa('TKN01', [validItem], 'idem-lensa-2');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Akses ditolak: Anda tidak memiliki akses ke gudang manapun');
    });

    it('rejects submission if Staff attempts to reconcile unassigned warehouse SAP Out', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF_03',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [1, 2],
        });
        // mockDbExecute returns only allowed headers matching the warehouseIds
        mockDbExecute.mockResolvedValueOnce([]); // No matching headers found in Staff warehouse

        const res = await submitRekonLensa('TKN01', [validItem], 'idem-lensa-3');
        expect(res.success).toBe(false);
        expect(res.error).toContain(
            'Akses ditolak: Sebagian transaksi bukan dari gudang wewenang Anda'
        );
    });

    it('blocks submission if WO already exists in transaction_used_header', async () => {
        mockDbExecute.mockResolvedValueOnce([{ wo_number: 'WO-LENSA-001' }]);

        const res = await submitRekonLensa('TKN01', [validItem], 'idem-lensa-4');
        expect(res.success).toBe(false);
        expect(res.error).toContain('sudah pernah digunakan');
    });

    it('successfully calls repository recordRekonLensa and markWoLensaReconciled on valid payload', async () => {
        const res = await submitRekonLensa('TKN01', [validItem], 'idem-lensa-5');

        expect(res.success).toBe(true);
        expect(mockGenerateTrxUsedLensaSeq).toHaveBeenCalledTimes(1);
        expect(mockRecordRekonLensa).toHaveBeenCalledWith(
            expect.objectContaining({
                idPemakaian: 'PEM-12345',
                woNumber: 'WO-LENSA-001',
                nikTeknisi: 'TKN01',
                createdBy: 'STAFF_01',
            })
        );
        expect(mockMarkWoLensaReconciled).toHaveBeenCalledWith('PEM-12345');
        expect(mockRevalidatePath).toHaveBeenCalledWith('/form/rekon-lensa');
        expect(mockRevalidatePath).toHaveBeenCalledWith('/apps/hasil-rekon');
    });

    it('detects duplicate idempotency request and returns warning', async () => {
        mockCheckAndStoreIdempotency.mockResolvedValueOnce({
            isDuplicate: true,
            result: null,
        });

        const res = await submitRekonLensa('TKN01', [validItem], 'idem-lensa-6');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Transaksi ganda terdeteksi');
        expect(mockRecordRekonLensa).not.toHaveBeenCalled();
    });

    it('getWOLensa calls getSessionUser and returns empty data when no WOs found', async () => {
        mockDbExecute.mockResolvedValueOnce([]);

        const res = await getWOLensa('TKN01');
        expect(res.success).toBe(true);
        expect(res.data).toEqual([]);
        expect(mockGetSessionUser).toHaveBeenCalled();
    });
});
