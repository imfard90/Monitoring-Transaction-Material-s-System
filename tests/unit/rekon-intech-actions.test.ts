import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionNik = vi.fn();
const mockCheckAndStoreIdempotency = vi.fn();
const mockSubmitRekonIntechRepo = vi.fn();
const mockDbExecuteTakeFirst = vi.fn();
const mockDbExecute = vi.fn();
const mockSqlExecute = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('next/cache', () => ({
    revalidatePath: (path: string) => mockRevalidatePath(path),
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionNik: () => mockGetSessionNik(),
    getSessionUser: vi.fn(),
}));

vi.mock('@/lib/security/idempotency', () => ({
    checkAndStoreIdempotency: (key: string, data: any, callback: any) =>
        mockCheckAndStoreIdempotency(key, data, callback),
}));

vi.mock('@/lib/repositories', () => ({
    createInventoryRepository: () => ({
        submitRekonIntech: (params: any) => mockSubmitRekonIntechRepo(params),
    }),
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: () => ({
            select: () => ({
                where: () => ({
                    executeTakeFirst: mockDbExecuteTakeFirst,
                    execute: mockDbExecute,
                }),
            }),
        }),
        transaction: () => ({
            execute: async (cb: any) => cb({}),
        }),
    },
}));

vi.mock('kysely', () => {
    const fakeSql = (strings: TemplateStringsArray, ...values: any[]) => ({
        strings,
        values,
        execute: mockSqlExecute,
    });
    return {
        sql: fakeSql,
    };
});

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
    },
}));

const { submitRekonIntech } = await import(
    '@/app/(DashboardLayout)/apps/rekon-intech/_actions/rekon-actions'
);

describe('rekon-intech-actions Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionNik.mockResolvedValue('STAFF_01');
        mockCheckAndStoreIdempotency.mockImplementation((_key, data, cb) =>
            cb(data).then((res: any) => ({ isDuplicate: false, result: res }))
        );
        mockDbExecuteTakeFirst.mockResolvedValue(null); // No wo_lensa_header conflict
        mockDbExecute.mockResolvedValue([]); // No existing WO numbers
        mockSqlExecute.mockResolvedValue({ rows: [{ seq: '0005' }] });
        mockSubmitRekonIntechRepo.mockResolvedValue({ rows: [] });
    });

    const validItem = {
        sap_out_id: '1',
        id_trx: 'TRX-OUT-01',
        sap_number: 'SAP-101',
        name_sa: 'SA-SBY',
        name_wh: 'WH-KP',
        designator_id: 10,
        sap_out_item_id: '100',
        qty: 2,
        wo_type: 'psb',
        wo_number: 'WO-2026-001',
        notes: 'Catatan rekon',
    };

    it('rejects when idemKey is empty', async () => {
        const res = await submitRekonIntech('TKN01', [validItem], '');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Idempotency key required');
    });

    it('rejects when items array is empty', async () => {
        const res = await submitRekonIntech('TKN01', [], 'idem-key-1');
        expect(res.success).toBe(false);
        expect(res.error).toContain('Invalid input data');
    });

    it('blocks submission if WO is managed by Rekon Lensa', async () => {
        mockDbExecuteTakeFirst.mockResolvedValueOnce({ rekon_check: true });

        const res = await submitRekonIntech('TKN01', [validItem], 'idem-key-2');
        expect(res.success).toBe(false);
        expect(res.error).toContain('sudah direkon melalui Rekon Lensa');
    });

    it('blocks submission if WO already exists in transaction_used_header', async () => {
        mockDbExecuteTakeFirst.mockResolvedValueOnce(null);
        mockDbExecute.mockResolvedValueOnce([{ wo_number: 'WO-2026-001' }]);

        const res = await submitRekonIntech('TKN01', [validItem], 'idem-key-3');
        expect(res.success).toBe(false);
        expect(res.error).toContain('sudah pernah digunakan');
    });

    it('successfully calls repository submitRekonIntech on valid payload', async () => {
        const res = await submitRekonIntech('TKN01', [validItem], 'idem-key-4');

        expect(res.success).toBe(true);
        expect(mockSubmitRekonIntechRepo).toHaveBeenCalledTimes(1);
        expect(mockSubmitRekonIntechRepo).toHaveBeenCalledWith(
            expect.objectContaining({
                nik: 'TKN01',
                sapOutId: '1',
                woNumber: 'WO-2026-001',
                createdBy: 'STAFF_01',
            })
        );
        expect(mockRevalidatePath).toHaveBeenCalledWith('/apps/rekon-intech');
    });
});
