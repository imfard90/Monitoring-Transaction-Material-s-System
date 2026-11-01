import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetSessionUser = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();

vi.mock('kysely', () => ({
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
        as: vi.fn(function (this: { strings: TemplateStringsArray; values: unknown[] }) {
            return this;
        }),
    })),
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/cache/encryptedCache', () => ({
    encryptedCache: {
        getGeneral: mockCacheGet,
        setGeneral: mockCacheSet,
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

const mockExecuteTakeFirst = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: () => {
            const query: Record<string, unknown> = {};
            query.innerJoin = () => query;
            query.leftJoin = () => query;
            query.select = () => query;
            query.where = () => query;
            query.groupBy = () => query;
            query.orderBy = () => query;
            query.limit = () => query;
            query.executeTakeFirst = mockExecuteTakeFirst;
            query.execute = mockExecute;
            return query;
        },
    },
}));

describe('getIntechAgingData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
        mockGetSessionUser.mockResolvedValue({
            nik: 'ADMIN01',
            role: 'Admin',
            isStaff: false,
            warehouseIds: [],
        });
    });

    it('rejects invalid parameters', async () => {
        const { getIntechAgingData } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
        );
        const result = await getIntechAgingData('invalid-id');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Parameter tidak valid');
    });

    it('returns cached data if available', async () => {
        const cachedData = {
            totalRecords: 10,
            totalQty: 50,
            tiers: [],
            topMaterials: [],
            topTechnicians: [],
        };
        mockCacheGet.mockResolvedValue(cachedData);

        const { getIntechAgingData } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
        );
        const result = await getIntechAgingData('all');
        expect(result.success).toBe(true);
        expect(result.data).toEqual(cachedData);
        expect(mockExecuteTakeFirst).not.toHaveBeenCalled();
    });

    it('computes aging tiers and percentages correctly from db results', async () => {
        mockExecuteTakeFirst.mockResolvedValue({
            total_records: 100,
            total_qty: '500',
            under_7d_count: 70,
            under_7d_qty: '350',
            d7_to_14d_count: 20,
            d7_to_14d_qty: '100',
            over_14d_count: 10,
            over_14d_qty: '50',
        });

        mockExecute
            .mockResolvedValueOnce([
                {
                    code: 'MAT-01',
                    description: 'Material 1',
                    unit: 'PC',
                    qty_intech: '200',
                    tx_count: 5,
                },
            ])
            .mockResolvedValueOnce([
                {
                    nik: 'TEK-01',
                    name: 'Teknisi 1',
                    qty_intech: '150',
                    tx_count: 3,
                },
            ]);

        const { getIntechAgingData } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
        );
        const result = await getIntechAgingData('all');

        expect(result.success).toBe(true);
        expect(result.data?.totalRecords).toBe(100);
        expect(result.data?.totalQty).toBe(500);

        const tiers = result.data?.tiers;
        expect(tiers).toHaveLength(3);
        expect(tiers?.[0]).toMatchObject({
            key: 'under_7d',
            count: 70,
            qty: 350,
            percentage: 70,
        });
        expect(tiers?.[1]).toMatchObject({
            key: 'd7_to_14d',
            count: 20,
            qty: 100,
            percentage: 20,
        });
        expect(tiers?.[2]).toMatchObject({
            key: 'over_14d',
            count: 10,
            qty: 50,
            percentage: 10,
        });

        expect(result.data?.topMaterials).toEqual([
            {
                code: 'MAT-01',
                description: 'Material 1',
                unit: 'PC',
                qty_intech: 200,
                tx_count: 5,
            },
        ]);

        expect(mockCacheSet).toHaveBeenCalled();
    });

    it('denies access if staff attempts to access unauthorized warehouse', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [1, 2],
        });

        const { getIntechAgingData } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
        );
        const result = await getIntechAgingData('99');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Akses gudang ditolak');
    });
});
