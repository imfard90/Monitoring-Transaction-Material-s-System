import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetSessionUser = vi.fn();
const mockExecuteTakeFirst = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockSelectFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();

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

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: (table: string) => {
            mockSelectFrom(table);
            const query: Record<string, unknown> = {};
            query.innerJoin = (...args: unknown[]) => {
                mockInnerJoin(...args);
                return query;
            };
            query.select = (...args: unknown[]) => {
                mockSelect(...args);
                return query;
            };
            query.where = (...args: unknown[]) => {
                mockWhere(...args);
                return query;
            };
            query.executeTakeFirst = mockExecuteTakeFirst;
            return query;
        },
    },
}));

const { getStockValueComparison } = await import(
    '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
);

describe('getStockValueComparison', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
    });

    it('returns error on invalid wh_id parameter', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });

        const result = await getStockValueComparison('not-a-valid-id');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Parameter tidak valid');
    });

    it('denies staff access to unauthorized warehouse', async () => {
        mockGetSessionUser.mockResolvedValue({
            isStaff: true,
            warehouseIds: [1, 2],
        });

        const result = await getStockValueComparison('99');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Akses gudang ditolak');
    });

    it('returns calculated stock comparison data correctly', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });

        // First call for stock_balance, second call for sap_out
        mockExecuteTakeFirst
            .mockResolvedValueOnce({
                total_rp: '2500000000',
                total_qty: '50000',
            })
            .mockResolvedValueOnce({
                total_rp: '500000000',
                total_qty: '10000',
            });

        const result = await getStockValueComparison('all');
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();

        if (result.data) {
            expect(result.data.stockInventoryRp).toBe(2500000000);
            expect(result.data.stockIntechRp).toBe(500000000);
            expect(result.data.totalRp).toBe(3000000000);
            // 2500000000 / 3000000000 = 83.333% -> 83.3%
            expect(result.data.inventoryPercentage).toBe(83.3);
            // 500000000 / 3000000000 = 16.666% -> 16.7%
            expect(result.data.intechPercentage).toBe(16.7);
            expect(result.data.totalInventoryQty).toBe(50000);
            expect(result.data.totalIntechQty).toBe(10000);
        }
    });

    it('serves cached data when cache hit occurs', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });
        const cachedData = {
            stockInventoryRp: 1000,
            stockIntechRp: 500,
            totalRp: 1500,
            inventoryPercentage: 66.7,
            intechPercentage: 33.3,
            totalInventoryQty: 10,
            totalIntechQty: 5,
        };
        mockCacheGet.mockResolvedValueOnce(cachedData);

        const result = await getStockValueComparison('all');
        expect(result.success).toBe(true);
        expect(result.data).toEqual(cachedData);
        expect(mockSelectFrom).not.toHaveBeenCalled();
    });
});
