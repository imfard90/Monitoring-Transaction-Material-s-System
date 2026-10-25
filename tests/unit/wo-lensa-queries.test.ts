import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockSqlExecute = vi.fn();
const mockCountExecuteTakeFirst = vi.fn();
const mockHeadersExecute = vi.fn();
const mockWarehouseOptionsExecute = vi.fn();
const mockWarehouseOptionsWhere = vi.fn();
const mockDetailsExecute = vi.fn();
const mockWhExecute = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('kysely', () => {
    const fakeSql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
        execute: mockSqlExecute,
    });
    return {
        sql: fakeSql,
    };
});

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn((table: string) => {
            if (table === 'inventory.mas_wh') {
                return {
                    select: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    execute: mockWhExecute,
                };
            }
            if (table === 'inventory.wo_lensa_list') {
                return {
                    selectAll: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    execute: mockDetailsExecute,
                };
            }
            // inventory.wo_lensa_header
            const headerQuery = {
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                execute: mockHeadersExecute,
                executeTakeFirst: mockCountExecuteTakeFirst,
            };
            const warehouseOptionsQuery = {
                where: mockWarehouseOptionsWhere.mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                execute: mockWarehouseOptionsExecute,
            };
            return {
                select: vi.fn((field: string) =>
                    field === 'nama_gudang' ? warehouseOptionsQuery : headerQuery
                ),
                selectAll: vi.fn().mockReturnValue(headerQuery),
                where: vi.fn().mockReturnThis(),
            };
        }),
    },
}));

const { getWOLensaList, getWOLensaFilterOptions, getWOLensaRefDetails } = await import(
    '@/app/(DashboardLayout)/reference/wo-lensa-ref/_actions/wo-lensa-queries'
);

describe('wo-lensa-queries Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({
            id: '1',
            nik: 'ADMIN01',
            role: 'Admin',
            isStaff: false,
            warehouseIds: [],
        });
        mockSqlExecute.mockResolvedValue({ rows: [] });
        mockCountExecuteTakeFirst.mockResolvedValue({ total: 1 });
        mockWarehouseOptionsExecute.mockResolvedValue([
            { nama_gudang: 'SO Gresik' },
            { nama_gudang: 'SO Surabaya' },
            { nama_gudang: 'SO Gresik' },
        ]);
        mockHeadersExecute.mockResolvedValue([
            {
                id: '100',
                pemakaian_id: '10001',
                tanggal_update: '12/10/2026',
                formatted_date: '2026-10-12',
                type: 'provisioning',
                wo_number: 'WO-123',
                nik_pemakai: '12345',
                nama_gudang: 'SO Gresik',
                gi_number: '49123',
                wbs: 'WBS-1',
                rekon_check: false,
            },
        ]);
        mockDetailsExecute.mockResolvedValue([
            {
                id: '1',
                header_id: '100',
                material_id: 'CLAMP-HOOK',
                material_desc: 'Clamp Hook',
                uom: 'Pcs',
                qty_pemakaian: 2,
            },
        ]);
        mockWhExecute.mockResolvedValue([{ name: 'SO Gresik' }]);
    });

    it('returns paginated WO Lensa results with joined materials for Admin', async () => {
        const result = await getWOLensaList({ page: 1, pageSize: 20 });

        expect(result.success).toBe(true);
        expect(result.data?.total).toBe(1);
        expect(result.data?.headers).toHaveLength(1);
        expect(result.data?.headers[0].id).toBe('100');
        expect(result.data?.headers[0].materials).toHaveLength(1);
        expect(result.data?.headers[0].materials?.[0].material_id).toBe('CLAMP-HOOK');
        expect(result.data?.warehouses).toEqual(['SO Gresik', 'SO Surabaya']);
    });

    it('returns empty array if Staff user has no assigned warehouses', async () => {
        mockGetSessionUser.mockResolvedValue({
            id: '2',
            nik: 'STAFF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [],
        });

        const result = await getWOLensaList({ page: 1, pageSize: 20 });

        expect(result.success).toBe(true);
        expect(result.data?.total).toBe(0);
        expect(result.data?.headers).toEqual([]);
    });

    it('limits warehouse options to the Staff warehouse scope', async () => {
        mockGetSessionUser.mockResolvedValue({
            id: '2',
            nik: 'STAFF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [7],
        });
        mockWhExecute.mockResolvedValue([{ name: 'SO Gresik' }]);
        mockWarehouseOptionsExecute.mockResolvedValue([
            { nama_gudang: 'SO Gresik' },
            { nama_gudang: 'SO Surabaya' },
        ]);

        const result = await getWOLensaList({ page: 1, pageSize: 20 });

        expect(result.success).toBe(true);
        expect(mockWarehouseOptionsWhere).toHaveBeenCalledWith(
            'nama_gudang',
            'in',
            expect.arrayContaining(['SO Gresik'])
        );
    });

    it('retrieves filter options correctly', async () => {
        const options = await getWOLensaFilterOptions();
        expect(options.warehouses).toEqual(['SO Gresik']);
    });

    it('retrieves header details by header ID', async () => {
        const details = await getWOLensaRefDetails('100');
        expect(details.success).toBe(true);
        expect(details.data).toHaveLength(1);
    });
});
