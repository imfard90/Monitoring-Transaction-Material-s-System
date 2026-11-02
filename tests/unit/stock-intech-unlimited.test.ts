import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/redis', () => ({
    redis: {
        set: vi.fn(),
        get: vi.fn(),
        eval: vi.fn(),
    },
}));

vi.mock('@/lib/google_ecosystem/sheets-stock-sync', () => ({
    loadOtherStockCache: vi.fn(),
    OTHER_STOCK_SYNC_LOCK_KEY: 'test-lock',
    OTHER_STOCK_SYNC_LOCK_TTL_SECONDS: 60,
    syncOtherStock: vi.fn(),
}));

const mockGetSessionUser = vi.fn();
const mockExecute = vi.fn();
const mockSelectFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockLeftJoin = vi.fn();
const mockSelect = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: (table: string) => {
            mockSelectFrom(table);
            const query: any = {
                innerJoin: (...args: any[]) => {
                    mockInnerJoin(...args);
                    return query;
                },
                leftJoin: (...args: any[]) => {
                    mockLeftJoin(...args);
                    return query;
                },
                select: (...args: any[]) => {
                    mockSelect(...args);
                    return query;
                },
                where: (...args: any[]) => {
                    mockWhere(...args);
                    return query;
                },
                orderBy: (...args: any[]) => {
                    mockOrderBy(...args);
                    return query;
                },
                limit: (...args: any[]) => {
                    mockLimit(...args);
                    return query;
                },
                execute: () => mockExecute(),
            };
            return query;
        },
    },
}));

vi.mock('@/lib/db/scopes', () => ({
    applyWarehouseScope: (query: any, column: string, user: any) => {
        if (user.isStaff && user.warehouseIds?.length) {
            return query.where(column, 'in', user.warehouseIds);
        }
        return query;
    },
}));

describe('getDashboardStockIntech', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('retrieves all intech stock without limit for non-staff user', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: false, warehouseIds: [] });
        mockExecute.mockResolvedValue([
            { nik: '16050479', material_code: 'SOC-ILS', wh_name: 'SO Gresik', qty_intech: 6 },
            { nik: '16050479', material_code: 'SOC-ILS', wh_name: 'SO Karangpilang', qty_intech: 6 },
        ]);

        const { getDashboardStockIntech } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-stock-queries'
        );

        const result = await getDashboardStockIntech();

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);
        // Ensure .limit() is never called
        expect(mockLimit).not.toHaveBeenCalled();
        expect(mockSelectFrom).toHaveBeenCalledWith('inventory.sap_out_header as soh');
        expect(mockOrderBy).toHaveBeenCalledWith('soh.request_time', 'asc');
    });

    it('applies warehouse scoping for staff user without limit', async () => {
        mockGetSessionUser.mockResolvedValue({ isStaff: true, warehouseIds: [1] });
        mockExecute.mockResolvedValue([
            { nik: '16050479', material_code: 'SOC-ILS', wh_name: 'SO Karangpilang', qty_intech: 6 },
        ]);

        const { getDashboardStockIntech } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-stock-queries'
        );

        const result = await getDashboardStockIntech();

        expect(result.success).toBe(true);
        expect(mockWhere).toHaveBeenCalledWith('t.wh_id', 'in', [1]);
        expect(mockLimit).not.toHaveBeenCalled();
    });
});
