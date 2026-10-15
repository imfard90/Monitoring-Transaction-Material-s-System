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
    sql: () => ({ execute: mockSqlExecute }),
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
                execute: mockHeaderExecute,
            };
            return {
                select: vi.fn((field: unknown) =>
                    field === 'nama_gudang' ? warehouseQuery : countQuery
                ),
                selectAll: vi.fn().mockReturnValue(headerQuery),
            };
        }),
    },
}));

const { getOutLensaRefList } = await import(
    '@/app/(DashboardLayout)/apps/out-lensa-ref/_actions/out-lensa-queries'
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
});
