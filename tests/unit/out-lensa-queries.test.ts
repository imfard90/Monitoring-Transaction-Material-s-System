import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockSqlExecute = vi.fn();
const mockCountExecuteTakeFirst = vi.fn();
const mockHeaderExecute = vi.fn();
const mockWarehouseOptionsExecute = vi.fn();
const mockWarehouseOptionsWhere = vi.fn();
const mockDetailsExecute = vi.fn();

vi.mock('@/lib/auth-server', () => ({ getSessionUser: () => mockGetSessionUser() }));
vi.mock('@/lib/redis', () => ({ redis: { get: vi.fn() } }));
vi.mock('kysely', () => ({
    sql: () => ({
        execute: mockSqlExecute,
        as: vi.fn().mockReturnThis(),
    }),
}));
vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn((table: string) => {
            if (table === 'inventory.out_lensa_ref_list') {
                return {
                    selectAll: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    execute: mockDetailsExecute,
                };
            }
            if (table === 'inventory.scraper_cronjob_log') {
                return {
                    selectAll: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnValue({
                        executeTakeFirst: vi.fn().mockResolvedValue(null),
                    }),
                };
            }
            const countQuery = {
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: mockCountExecuteTakeFirst,
            };
            const warehouseQuery = {
                where: mockWarehouseOptionsWhere.mockReturnThis(),
                distinct: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                execute: mockWarehouseOptionsExecute,
            };
            const headerQuery = {
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                offset: vi.fn().mockReturnThis(),
                groupBy: vi.fn().mockReturnThis(),
                having: vi.fn().mockReturnThis(),
                leftJoin: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                execute: mockHeaderExecute,
            };
            return {
                select: vi.fn((field: unknown) =>
                    field === 'nama_gudang' ? warehouseQuery : countQuery
                ),
                selectAll: vi.fn().mockReturnValue(headerQuery),
                where: vi.fn().mockReturnThis(),
                leftJoin: vi.fn().mockReturnValue(headerQuery),
            };
        }),
    },
}));

const { getOutLensaRefList, getOutLensaReservationIdOptions } = await import(
    '@/app/(DashboardLayout)/reference/out-lensa-ref/_actions/out-lensa-queries'
);

describe('out-lensa-queries warehouse options', () => {
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
        mockHeaderExecute.mockResolvedValue([]);
        mockDetailsExecute.mockResolvedValue([]);
    });

    it('returns unique warehouse options from all matching rows, even when the current page is empty', async () => {
        const result = await getOutLensaRefList({ page: 99, pageSize: 20 });

        expect(result.success).toBe(true);
        expect(result.data?.headers).toEqual([]);
        expect(result.data?.warehouses).toEqual(['SO Gresik', 'SO Surabaya']);
    });

    it('applies the Staff warehouse scope to warehouse options', async () => {
        mockGetSessionUser.mockResolvedValue({
            id: '2',
            nik: 'STAFF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [7],
        });
        const selectWhBuilder = {
            select: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue([{ name: 'SO Gresik' }]),
        };
        const { db } = await import('@/lib/db/db');
        vi.mocked(db.selectFrom).mockImplementationOnce(() => selectWhBuilder as never);

        const result = await getOutLensaRefList();

        expect(result.success).toBe(true);
        expect(mockWarehouseOptionsWhere).toHaveBeenCalledWith(
            'nama_gudang',
            'in',
            expect.arrayContaining(['SO Gresik'])
        );
    });

    it('accepts search option and executes successfully', async () => {
        const result = await getOutLensaRefList({ search: '10001234' });

        expect(result.success).toBe(true);
        expect(result.data?.page).toBe(1);
    });

    it('retrieves reservation ID options for dropdown (only those without details)', async () => {
        mockHeaderExecute.mockResolvedValueOnce([
            {
                id: '101',
                reservation_id: 'RES-001',
                gi_number: 'GI-101',
                nama_gudang: 'SO Gresik',
                item_count: 0,
            },
            {
                id: '102',
                reservation_id: 'RES-002',
                gi_number: null,
                nama_gudang: null,
                item_count: 0,
            },
        ]);

        const res = await getOutLensaReservationIdOptions();
        expect(res.error).toBeUndefined();
        expect(res.success).toBe(true);
        expect(res.data).toHaveLength(2);
        expect(res.data?.[0].value).toBe('RES-001');
        expect(res.data?.[0].has_details).toBe(false);
        expect(res.data?.[0].label).toBe('RES-001 — GI: GI-101 (SO Gresik)');
        expect(res.data?.[1].value).toBe('RES-002');
        expect(res.data?.[1].has_details).toBe(false);
        expect(res.data?.[1].label).toBe('RES-002 — Tanpa No GI');
    });

    it('returns empty reservation options when staff has no assigned warehouse', async () => {
        mockGetSessionUser.mockResolvedValueOnce({
            id: '2',
            nik: 'STAFF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [],
        });

        const res = await getOutLensaReservationIdOptions();
        expect(res.success).toBe(true);
        expect(res.data).toEqual([]);
    });
});
