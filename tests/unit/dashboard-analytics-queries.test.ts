import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
    mockGetSessionUser,
    mockCacheGet,
    mockCacheSet,
    mockGetKproRekonDistrictRollup,
    mockGetKproRekonDailyTrend,
} = vi.hoisted(() => ({
    mockGetSessionUser: vi.fn(),
    mockCacheGet: vi.fn(),
    mockCacheSet: vi.fn(),
    mockGetKproRekonDistrictRollup: vi.fn(),
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
        getKproRekonDistrictRollup: (params: unknown) => mockGetKproRekonDistrictRollup(params),
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

    it('returns calculated summary, district rollup, and daily trend for all districts', async () => {
        const mockRollup = [
            {
                district_tif: 'LAMONGAN',
                total_orders: 100,
                total_rekon_lensa: 80,
                total_belum_rekon: 20,
                persentase_rekon: 80,
            },
            {
                district_tif: 'SURAMADU',
                total_orders: 50,
                total_rekon_lensa: 0,
                total_belum_rekon: 50,
                persentase_rekon: 0,
            },
        ];

        const mockTrend = [
            {
                tgl: '2026-11-01',
                total_orders: 50,
                total_rekon_lensa: 30,
                total_belum_rekon: 20,
                persentase_rekon: 60,
            },
            {
                tgl: '2026-11-02',
                total_orders: 100,
                total_rekon_lensa: 50,
                total_belum_rekon: 50,
                persentase_rekon: 50,
            },
        ];

        mockGetKproRekonDistrictRollup.mockResolvedValue(mockRollup);
        mockGetKproRekonDailyTrend.mockResolvedValue(mockTrend);

        const res = await getKproRekonAnalytics({ days: 30, district: 'all' });

        expect(res.success).toBe(true);
        expect(res.data).toBeDefined();
        expect(res.data?.summary).toEqual({
            totalOrders: 150,
            totalRekonLensa: 80,
            totalBelumRekon: 70,
            persentaseRekon: 53.33,
        });
        expect(res.data?.districts).toEqual(['LAMONGAN', 'SURAMADU']);
        expect(res.data?.districtRollup).toEqual(mockRollup);
        expect(res.data?.dailyTrend).toEqual(mockTrend);

        // Verifikasi cache set dipanggil dengan TTL 300s
        expect(mockCacheSet).toHaveBeenCalledWith(
            'analytics',
            expect.objectContaining({ summary: expect.any(Object) }),
            'kpro_rekon_30_all',
            300
        );
    });

    it('filters summary by specific district when requested', async () => {
        const mockRollup = [
            {
                district_tif: 'LAMONGAN',
                total_orders: 100,
                total_rekon_lensa: 90,
                total_belum_rekon: 10,
                persentase_rekon: 90,
            },
            {
                district_tif: 'SURAMADU',
                total_orders: 50,
                total_rekon_lensa: 10,
                total_belum_rekon: 40,
                persentase_rekon: 20,
            },
        ];

        mockGetKproRekonDistrictRollup.mockResolvedValue(mockRollup);
        mockGetKproRekonDailyTrend.mockResolvedValue([]);

        const res = await getKproRekonAnalytics({ days: 14, district: 'LAMONGAN' });

        expect(res.success).toBe(true);
        expect(res.data?.summary).toEqual({
            totalOrders: 100,
            totalRekonLensa: 90,
            totalBelumRekon: 10,
            persentaseRekon: 90,
        });
        expect(mockGetKproRekonDailyTrend).toHaveBeenCalledWith({
            district: 'LAMONGAN',
            days: 14,
        });
    });

    it('returns cached data if cache is warm', async () => {
        const cachedData = {
            summary: {
                totalOrders: 200,
                totalRekonLensa: 150,
                totalBelumRekon: 50,
                persentaseRekon: 75,
            },
            districtRollup: [],
            dailyTrend: [],
            districts: ['LAMONGAN'],
            selectedDistrict: 'all',
            selectedDays: 30,
        };

        mockCacheGet.mockResolvedValue(cachedData);

        const res = await getKproRekonAnalytics({ days: 30, district: 'all' });

        expect(res.success).toBe(true);
        expect(res.data).toEqual(cachedData);
        expect(mockGetKproRekonDistrictRollup).not.toHaveBeenCalled();
        expect(mockGetKproRekonDailyTrend).not.toHaveBeenCalled();
    });

    it('throws authorization error if session user is null (Rule 1.1)', async () => {
        mockGetSessionUser.mockResolvedValue(null);

        await expect(getKproRekonAnalytics()).rejects.toThrow();
    });

    it('returns error result when repository throws', async () => {
        mockGetKproRekonDistrictRollup.mockRejectedValue(new Error('Database timeout'));

        const res = await getKproRekonAnalytics();

        expect(res.success).toBe(false);
        expect(res.error).toBe('Gagal memuat analitik K-PRO');
    });
});
