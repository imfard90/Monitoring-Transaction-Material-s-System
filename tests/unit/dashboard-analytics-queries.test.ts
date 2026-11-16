import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
    mockGetSessionUser,
    mockCacheGet,
    mockCacheSet,
    mockGetKproRekonDatelRollup,
    mockGetKproRekonDailyTrend,
} = vi.hoisted(() => ({
    mockGetSessionUser: vi.fn(),
    mockCacheGet: vi.fn(),
    mockCacheSet: vi.fn(),
    mockGetKproRekonDatelRollup: vi.fn(),
    mockGetKproRekonDailyTrend: vi.fn(),
}));

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/cache/encryptedCache', () => ({
    encryptedCache: {
        getGeneral: (...args: unknown[]) => mockCacheGet(...args),
        setGeneral: (...args: unknown[]) => mockCacheSet(...args),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('@/lib/repositories', () => ({
    analyticsRepository: {
        getKproRekonDatelRollup: (params: unknown) => mockGetKproRekonDatelRollup(params),
        getKproRekonDailyTrend: (params: unknown) => mockGetKproRekonDailyTrend(params),
    },
}));

import { getKproRekonAnalytics } from '@/app/(DashboardLayout)/_actions/dashboard-analytics-queries';

describe('getKproRekonAnalytics Action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({
            id: 'user-1',
            nik: '900123',
            name: 'Test Supervisor',
            role: 'supervisor',
            isStaff: false,
        });
        mockCacheGet.mockResolvedValue(null);
        mockCacheSet.mockResolvedValue(undefined);
    });

    it('returns calculated summary, warehouse rollup, and daily trend for all warehouses in Lamongan', async () => {
        const mockRollup = [
            {
                datel_baru: 'GRESIK',
                total_orders: 100,
                total_rekon_lensa: 95,
                total_belum_rekon: 5,
                persentase_rekon: 95,
            },
            {
                datel_baru: 'BJNEGORO',
                total_orders: 50,
                total_rekon_lensa: 48,
                total_belum_rekon: 2,
                persentase_rekon: 96,
            },
        ];

        const mockTrend = [
            {
                tgl: '2026-11-01',
                total_orders: 50,
                total_rekon_lensa: 48,
                total_belum_rekon: 2,
                persentase_rekon: 96,
            },
            {
                tgl: '2026-11-02',
                total_orders: 100,
                total_rekon_lensa: 95,
                total_belum_rekon: 5,
                persentase_rekon: 95,
            },
        ];

        mockGetKproRekonDatelRollup.mockResolvedValue(mockRollup);
        mockGetKproRekonDailyTrend.mockResolvedValue(mockTrend);

        const res = await getKproRekonAnalytics({ days: 30, warehouse: 'all' });

        expect(res.success).toBe(true);
        expect(res.data).toBeDefined();
        expect(res.data?.district).toBe('LAMONGAN');
        expect(res.data?.summary).toEqual({
            totalOrders: 150,
            totalRekonLensa: 143,
            totalBelumRekon: 7,
            persentaseRekon: 95.33,
        });
        expect(res.data?.warehouseRollup).toEqual([
            {
                datel: 'GRESIK',
                warehouseName: 'SO Gresik',
                total_orders: 100,
                total_rekon_lensa: 95,
                total_belum_rekon: 5,
                persentase_rekon: 95,
            },
            {
                datel: 'BJNEGORO',
                warehouseName: 'SO Bojonegoro',
                total_orders: 50,
                total_rekon_lensa: 48,
                total_belum_rekon: 2,
                persentase_rekon: 96,
            },
        ]);
        expect(res.data?.warehouses).toEqual([
            { datel: 'GRESIK', name: 'SO Gresik' },
            { datel: 'BJNEGORO', name: 'SO Bojonegoro' },
        ]);
        expect(res.data?.dailyTrend).toEqual(mockTrend);

        // Verifikasi cache set dipanggil dengan TTL 300s
        expect(mockCacheSet).toHaveBeenCalledWith(
            'analytics',
            expect.objectContaining({ summary: expect.any(Object) }),
            'kpro_rekon_lamongan_30_all',
            300
        );
    });

    it('filters summary and daily trend by specific warehouse when requested', async () => {
        const mockRollup = [
            {
                datel_baru: 'GRESIK',
                total_orders: 100,
                total_rekon_lensa: 95,
                total_belum_rekon: 5,
                persentase_rekon: 95,
            },
            {
                datel_baru: 'BJNEGORO',
                total_orders: 50,
                total_rekon_lensa: 48,
                total_belum_rekon: 2,
                persentase_rekon: 96,
            },
        ];

        mockGetKproRekonDatelRollup.mockResolvedValue(mockRollup);
        mockGetKproRekonDailyTrend.mockResolvedValue([]);

        const res = await getKproRekonAnalytics({ days: 14, warehouse: 'GRESIK' });

        expect(res.success).toBe(true);
        expect(res.data?.summary).toEqual({
            totalOrders: 100,
            totalRekonLensa: 95,
            totalBelumRekon: 5,
            persentaseRekon: 95,
        });
        expect(mockGetKproRekonDailyTrend).toHaveBeenCalledWith({
            district: 'LAMONGAN',
            datel: 'GRESIK',
            days: 14,
        });
    });

    it('returns cached data if cache is warm', async () => {
        const cachedData = {
            district: 'LAMONGAN',
            summary: {
                totalOrders: 200,
                totalRekonLensa: 190,
                totalBelumRekon: 10,
                persentaseRekon: 95,
            },
            warehouseRollup: [],
            dailyTrend: [],
            warehouses: [{ datel: 'GRESIK', name: 'SO Gresik' }],
            selectedWarehouse: 'all',
            selectedDays: 30,
        };

        mockCacheGet.mockResolvedValue(cachedData);

        const res = await getKproRekonAnalytics({ days: 30, warehouse: 'all' });

        expect(res.success).toBe(true);
        expect(res.data).toEqual(cachedData);
        expect(mockGetKproRekonDatelRollup).not.toHaveBeenCalled();
        expect(mockGetKproRekonDailyTrend).not.toHaveBeenCalled();
    });

    it('throws authorization error if session user is null (Rule 1.1)', async () => {
        mockGetSessionUser.mockResolvedValue(null);

        await expect(getKproRekonAnalytics()).rejects.toThrow();
    });

    it('returns error result when repository throws', async () => {
        mockGetKproRekonDatelRollup.mockRejectedValue(new Error('Database timeout'));

        const res = await getKproRekonAnalytics();

        expect(res.success).toBe(false);
        expect(res.error).toBe('Gagal memuat analitik K-PRO');
    });
});
