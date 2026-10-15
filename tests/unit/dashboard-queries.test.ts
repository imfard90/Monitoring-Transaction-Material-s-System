import { beforeEach, describe, expect, it, vi } from 'vitest';

// server-only is a Next.js build-time guard — stub it in unit tests
vi.mock('server-only', () => ({}));

// Mock the Sheets sync module so unit tests don't touch the filesystem
const mockLoadOtherStockCache = vi.fn();
vi.mock('@/lib/google_ecosystem/sheets-stock-sync', () => ({
    loadOtherStockCache: mockLoadOtherStockCache,
    OTHER_STOCK_SYNC_LOCK_KEY: 'lock:other_stock_sync',
    OTHER_STOCK_SYNC_LOCK_TTL_SECONDS: 600,
    syncOtherStock: vi.fn(),
}));
const mockRedisSet = vi.fn<(...args: unknown[]) => Promise<string | null>>();
const mockRedisEval = vi.fn<(...args: unknown[]) => Promise<number>>();
vi.mock('@/lib/redis', () => ({
    redis: { set: mockRedisSet, eval: mockRedisEval },
}));
vi.mock('@/lib/errors', () => ({
    AuthorizationError: class AuthorizationError extends Error {},
    ConflictError: class ConflictError extends Error {},
}));
vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => 'test-lock-token') }));

const mockGetSessionUser = vi.fn();
const mockExecute = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockSql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
    as: vi.fn(function (this: { strings: TemplateStringsArray; values: unknown[] }) {
        return this;
    }),
}));
const mockSelectFrom = vi.fn();
const mockGroupBy = vi.fn();
const mockSelect = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockWhereByTable = vi.fn();
const mockOnRef = vi.fn();
const mockJoinOn = vi.fn();

vi.mock('kysely', () => ({ sql: mockSql }));
vi.mock('@/lib/auth-server', () => ({ getSessionUser: () => mockGetSessionUser() }));
vi.mock('@/lib/cache/encryptedCache', () => ({
    encryptedCache: { getGeneral: mockCacheGet, setGeneral: mockCacheSet },
}));
vi.mock('@/lib/logger', () => ({
    actionLogger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: (table: string) => {
            mockSelectFrom(table);
            const query = {
                innerJoin: (...args: unknown[]) => {
                    mockInnerJoin(...args);
                    if (typeof args[1] === 'function') {
                        const joinBuilder = {
                            on: (...onArgs: unknown[]) => {
                                mockJoinOn(...onArgs);
                                return joinBuilder;
                            },
                            onRef: (...onRefArgs: unknown[]) => {
                                mockOnRef(...onRefArgs);
                                return joinBuilder;
                            },
                        };
                        (args[1] as (join: typeof joinBuilder) => unknown)(joinBuilder);
                    }
                    return query;
                },
                select: (...args: unknown[]) => {
                    mockSelect(...args);
                    for (const arg of args) {
                        if (Array.isArray(arg)) {
                            for (const expression of arg) {
                                if (
                                    expression &&
                                    typeof expression === 'object' &&
                                    'as' in expression
                                ) {
                                    (expression as { as: () => unknown }).as();
                                }
                            }
                        }
                    }
                    return query;
                },
                where: (...args: unknown[]) => {
                    mockWhere(...args);
                    mockWhereByTable(table, ...args);
                    return query;
                },
                whereRef: (...args: unknown[]) => {
                    mockWhere(...args);
                    return query;
                },
                groupBy: (...args: unknown[]) => {
                    mockGroupBy(...args);
                    return query;
                },
                orderBy: vi.fn(() => query),
                limit: vi.fn(() => query),
                execute: mockExecute,
            };
            return query;
        },
    },
}));

const {
    getLensaWarehousePerformance,
    getOtherWarehouseStock,
    triggerOtherStockSync,
    getStockWarnings,
    getWarehouses,
} = await import('@/app/(DashboardLayout)/_actions/dashboard-queries');
const { getTopOutMaterials, getOutMaterialLineChartData } = await import(
    '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
);
const { syncOtherStock: mockSyncOtherStock } = await import(
    '@/lib/google_ecosystem/sheets-stock-sync'
);
const { getSalesOverviewData } = await import(
    '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
);

describe('triggerOtherStockSync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });
        mockRedisSet.mockResolvedValue('OK');
        mockRedisEval.mockResolvedValue(1);
        vi.mocked(mockSyncOtherStock).mockResolvedValue(undefined);
    });

    it('rejects Staff before trying to acquire the sync lock', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [2] });

        await expect(triggerOtherStockSync()).rejects.toThrow('Staff tidak diizinkan');
        expect(mockRedisSet).not.toHaveBeenCalled();
        expect(mockSyncOtherStock).not.toHaveBeenCalled();
    });

    it('reports a conflict when another sync already holds the lock', async () => {
        mockRedisSet.mockResolvedValue(null);

        await expect(triggerOtherStockSync()).rejects.toThrow('sedang berjalan');
        expect(mockSyncOtherStock).not.toHaveBeenCalled();
    });

    it('runs the sync and releases only its own lock', async () => {
        await expect(triggerOtherStockSync()).resolves.toEqual({ success: true });

        expect(mockSyncOtherStock).toHaveBeenCalledOnce();
        expect(mockRedisEval).toHaveBeenCalledWith(
            expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),
            1,
            'lock:other_stock_sync',
            'test-lock-token'
        );
    });
});

describe('dashboard warehouse scoping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCacheGet.mockResolvedValue(null);
        mockExecute.mockResolvedValue([]);
    });

    it('scopes every panel query to assigned warehouses for Staff', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [2, 4] });

        await getTopOutMaterials();
        expect(mockWhere).toHaveBeenCalledWith('soh.warehouse_id', 'in', [2, 4]);

        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [2, 4] });
        await getOutMaterialLineChartData('all');
        expect(mockWhere).toHaveBeenCalledWith('soh.warehouse_id', 'in', [2, 4]);

        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [2, 4] });
        await getStockWarnings();
        expect(mockWhere).toHaveBeenCalledWith('p.warehouse_id', 'in', [2, 4]);
    });

    it('returns no results for Staff without assigned warehouses', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [] });

        await expect(getTopOutMaterials()).resolves.toMatchObject({ success: true, data: [] });
        await expect(getOutMaterialLineChartData('all')).resolves.toMatchObject({
            success: true,
            data: [],
        });
        await expect(getStockWarnings()).resolves.toMatchObject({ success: true, data: [] });
        expect(mockSelectFrom).not.toHaveBeenCalled();
    });

    it('rejects attempted access to an unassigned warehouse for Staff', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [2] });

        await expect(getTopOutMaterials(7, '99')).resolves.toMatchObject({ success: false });
        await expect(getOutMaterialLineChartData('99')).resolves.toMatchObject({ success: false });
        await expect(getStockWarnings('99')).resolves.toMatchObject({ success: false });
        expect(mockSelectFrom).not.toHaveBeenCalled();
    });

    it('preserves all-warehouse access for non-Staff', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });

        await getTopOutMaterials();
        await getOutMaterialLineChartData('all');
        await getStockWarnings();

        expect(mockWhere).not.toHaveBeenCalledWith('soh.warehouse_id', 'in', expect.anything());
        expect(mockWhere).not.toHaveBeenCalledWith('p.warehouse_id', 'in', expect.anything());
    });

    it('returns only assigned warehouse choices to Staff', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [2] });
        await getWarehouses();
        expect(mockWhere).toHaveBeenCalledWith('id', 'in', [2]);
    });
});

describe('getLensaWarehousePerformance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });
        mockExecute.mockResolvedValue([]);
        mockCacheGet.mockResolvedValue(null);
        mockCacheSet.mockResolvedValue(undefined);
    });

    it('includes linked Lensa quantities with Intech results in the chart', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });
        mockExecute
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ date_val: '2026-01-01', total_qty: 3 }])
            .mockResolvedValueOnce([{ date_val: '2026-01-01', total_qty: 4 }]);

        const result = await getSalesOverviewData('all', 1, new Date(2026, 0, 1, 23, 59, 59));

        expect(result.success).toBe(true);
        if (result.success && result.data) {
            expect(result.data.hasilRekon).toEqual([-7]);
        }
        expect(mockSelectFrom).toHaveBeenCalledWith('inventory.transaction_used_header as tu');
        expect(mockSelectFrom).toHaveBeenCalledWith('inventory.rekon_used_header as ruh');
        expect(mockInnerJoin).toHaveBeenCalledWith(
            'inventory.sap_out_header as soh',
            'soh.sap_number',
            'rul.out_sap'
        );
    });

    it('rejects Staff access to warehouses outside their assignment', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [2] });

        const result = await getSalesOverviewData('99', 1, new Date(2026, 0, 1));

        expect(result).toEqual({ success: false, error: 'Akses gudang ditolak' });
        expect(mockSelectFrom).not.toHaveBeenCalled();
    });

    it('normalizes warehouse names in both Lensa performance joins', async () => {
        await getLensaWarehousePerformance();

        expect(mockInnerJoin).toHaveBeenCalledTimes(2);
        const joinComparisons = mockJoinOn.mock.calls.map(([left, , right]) => [left, right]);
        expect(
            joinComparisons.flat().every((expression) => {
                const template = expression as { strings: string[] };
                return template.strings.join('').includes('REGEXP_REPLACE');
            })
        ).toBe(true);
    });

    it('limits Out Lensa HI metrics to headers dated today', async () => {
        await getLensaWarehousePerformance();

        expect(mockWhereByTable).toHaveBeenCalledWith(
            'inventory.out_lensa_ref_header as olh',
            'olh.formatted_date',
            '=',
            expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining('CURRENT_DATE')]),
            })
        );
        expect(mockExecute).toHaveBeenCalledTimes(2);
    });
});

// ─── getOtherWarehouseStock ────────────────────────────────────────────────────

describe('getOtherWarehouseStock', () => {
    const MOCK_ITEMS = [
        {
            regional: 'JATIM',
            branch: 'SBY',
            gudang: 'GDG-01',
            materialCode: 'MAT001',
            materialName: 'Lensa XR',
            stockH1: 50,
        },
        {
            regional: 'JATIM',
            branch: 'MLG',
            gudang: 'GDG-02',
            materialCode: 'MAT001',
            materialName: 'Lensa XR',
            stockH1: 120,
        },
        {
            regional: 'JABAR',
            branch: 'BDG',
            gudang: 'GDG-03',
            materialCode: 'MAT002',
            materialName: 'Kabel UTP',
            stockH1: 10,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });
        mockLoadOtherStockCache.mockReturnValue({
            syncedAt: new Date().toISOString(),
            rowCount: MOCK_ITEMS.length,
            items: MOCK_ITEMS,
        });
    });

    it('returns only items matching the requested materialCode (case-insensitive)', async () => {
        const result = await getOtherWarehouseStock('mat001');

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toHaveLength(2);
            expect(result.data.every((i) => i.materialCode === 'MAT001')).toBe(true);
        }
    });

    it('sorts results descending by stockH1', async () => {
        const result = await getOtherWarehouseStock('MAT001');

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data[0].stockH1).toBe(120);
            expect(result.data[1].stockH1).toBe(50);
        }
    });

    it('returns empty array when no items match the code', async () => {
        const result = await getOtherWarehouseStock('NOTEXIST');

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toHaveLength(0);
        }
    });

    it('returns error when cache is null (not yet synced)', async () => {
        mockLoadOtherStockCache.mockReturnValue(null);

        const result = await getOtherWarehouseStock('MAT001');

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('belum tersinkronisasi');
        }
    });

    it('returns error when materialCode is empty string', async () => {
        const result = await getOtherWarehouseStock('');

        expect(result.success).toBe(false);
    });

    it('rejects unauthenticated callers', async () => {
        mockGetSessionUser.mockRejectedValue(new Error('AuthenticationError'));

        const result = await getOtherWarehouseStock('MAT001');

        expect(result.success).toBe(false);
    });
});
