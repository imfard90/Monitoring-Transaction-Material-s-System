import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockSqlExecute = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/db/db', () => ({
    db: {},
}));

vi.mock('kysely', () => {
    const fakeSql = (strings: TemplateStringsArray, ...values: any[]) => ({
        strings,
        values,
        execute: mockSqlExecute,
    });
    fakeSql.join = (items: any[], _separator?: any) => items;
    return {
        sql: fakeSql,
    };
});

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
    },
}));

const { exportHasilRekonData } = await import(
    '@/app/(DashboardLayout)/apps/hasil-rekon/_actions/rekon-export-actions'
);

describe('exportHasilRekonData server action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects invalid month or year input', async () => {
        const resultInvalidMonth = await exportHasilRekonData({ month: 13, year: 2026 });
        expect(resultInvalidMonth.success).toBe(false);
        expect(resultInvalidMonth.error).toContain('Periode bulan atau tahun tidak valid');

        const resultInvalidYear = await exportHasilRekonData({ month: 5, year: 1990 });
        expect(resultInvalidYear.success).toBe(false);
    });

    it('returns empty data fail-closed if user is Staff with no assigned warehouses', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF01',
            role: 'Staff',
            warehouseIds: [],
            isStaff: true,
            branchId: 1,
            branchName: 'Branch Test',
        });

        const result = await exportHasilRekonData({ month: 10, year: 2026 });

        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
        // sql execute should not be called since it fails closed
        expect(mockSqlExecute).not.toHaveBeenCalled();
    });

    it('queries with warehouse scoping when user is Staff with warehouseIds', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF02',
            role: 'Staff',
            warehouseIds: [1, 2],
            isStaff: true,
            branchId: 1,
            branchName: 'Branch Test',
        });

        mockSqlExecute.mockResolvedValue({
            rows: [
                {
                    created_at: '2026-10-05T10:00:00.000Z',
                    trx_id: 'TRX-123',
                    sap_number: 'SAP-999',
                    warehouse_name: 'Gudang Pusat',
                    nik: 'TEK01',
                    type: 'psb',
                    workorder: 'WO-111',
                    material_code: 'MAT-01',
                    material_name: 'Drop Cable',
                    qty: 5,
                },
            ],
        });

        const result = await exportHasilRekonData({ month: 10, year: 2026 });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toMatchObject({
            trx_id: 'TRX-123',
            sap_number: 'SAP-999',
            warehouse_name: 'Gudang Pusat',
            qty: 5,
        });
        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
    });

    it('queries without warehouse scoping when user is Non-Staff (e.g. Supervisor/Admin)', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'ADMIN01',
            role: 'Administrator',
            warehouseIds: [],
            isStaff: false,
            branchId: null,
            branchName: null,
        });

        mockSqlExecute.mockResolvedValue({
            rows: [
                {
                    created_at: new Date('2026-10-01T08:00:00.000Z'),
                    trx_id: 'TRX-999',
                    sap_number: 'SAP-001',
                    warehouse_name: 'Gudang Barat',
                    nik: 'TEK02',
                    type: 'lensa',
                    workorder: 'WO-222',
                    material_code: 'MAT-02',
                    material_name: 'ONT Router',
                    qty: 1,
                },
            ],
        });

        const result = await exportHasilRekonData({ month: 10, year: 2026 });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.trx_id).toBe('TRX-999');
        expect(result.data[0]?.material_name).toBe('ONT Router');
    });

    it('handles query or session failure gracefully with error result', async () => {
        mockGetSessionUser.mockRejectedValue(new Error('Session revoked'));

        const result = await exportHasilRekonData({ month: 10, year: 2026 });

        expect(result.success).toBe(false);
        expect(result.data).toEqual([]);
        expect(result.error).toBe('Gagal memuat data ekspor hasil rekon');
    });
});
