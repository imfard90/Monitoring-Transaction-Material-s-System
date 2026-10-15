import { beforeEach, describe, expect, it, vi } from 'vitest';

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
                groupBy: (...args: unknown[]) => {
                    mockGroupBy(...args);
                    return query;
                },
                execute: mockExecute,
            };
            return query;
        },
    },
}));

const { getLensaWarehousePerformance } = await import(
    '@/app/(DashboardLayout)/_actions/dashboard-queries'
);
const { getSalesOverviewData } = await import(
    '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
);

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
