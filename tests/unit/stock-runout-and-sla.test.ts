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

describe('getStockRunoutForecast', () => {
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

    it('validates warehouse authorization for staff', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF01',
            role: 'Staff',
            isStaff: true,
            warehouseIds: [1, 2],
        });

        const { getStockRunoutForecast } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
        );
        const result = await getStockRunoutForecast('99');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Akses gudang ditolak');
    });

    it('computes days of supply and flags critical items', async () => {
        mockExecute.mockResolvedValue([
            {
                material_code: 'MAT-CRIT',
                material_name: 'Critical Material',
                material_unit: 'PC',
                warehouse_name: 'Gudang Pusat',
                qty_stock: '10',
                weekly_demand: '35',
                daily_demand: '5.0',
                days_of_supply: '2.0',
            },
            {
                material_code: 'MAT-WARN',
                material_name: 'Warning Material',
                material_unit: 'M',
                warehouse_name: 'Gudang Cabang',
                qty_stock: '50',
                weekly_demand: '35',
                daily_demand: '5.0',
                days_of_supply: '10.0',
            },
            {
                material_code: 'MAT-SAFE',
                material_name: 'Safe Material',
                material_unit: 'SET',
                warehouse_name: 'Gudang Cabang',
                qty_stock: '200',
                weekly_demand: '35',
                daily_demand: '5.0',
                days_of_supply: '40.0',
            },
        ]);

        const { getStockRunoutForecast } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
        );
        const result = await getStockRunoutForecast('all');
        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(3);
        expect(result.data?.[0].status).toBe('critical');
        expect(result.data?.[1].status).toBe('warning');
        expect(result.data?.[2].status).toBe('safe');
    });
});

describe('getRekonSlaVelocity', () => {
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

    it('computes SLA rate and percentages correctly', async () => {
        mockExecuteTakeFirst.mockResolvedValue({
            total_open: 100,
            avg_days_open: '5.5',
            on_time_count: 60,
            warning_count: 30,
            breached_count: 10,
        });

        const { getRekonSlaVelocity } = await import(
            '@/app/(DashboardLayout)/_actions/dashboard-charts-queries'
        );
        const result = await getRekonSlaVelocity('all');
        expect(result.success).toBe(true);
        expect(result.data?.totalOpen).toBe(100);
        expect(result.data?.avgDays).toBe(5.5);
        expect(result.data?.slaRate).toBe(60);

        const tiers = result.data?.tiers;
        expect(tiers).toHaveLength(3);
        expect(tiers?.[0]).toMatchObject({ key: 'on_time', count: 60, percentage: 60 });
        expect(tiers?.[1]).toMatchObject({ key: 'warning', count: 30, percentage: 30 });
        expect(tiers?.[2]).toMatchObject({ key: 'breached', count: 10, percentage: 10 });
    });
});

