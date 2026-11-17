import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createAnalyticsRepository } from '@/lib/repositories/analytics.repository';

describe('Analytics Repository Unit Tests', () => {
    it('should query K-PRO rekon summary with default 90 days filter', async () => {
        const mockRows = [
            {
                tgl: '2026-11-14',
                district_tif: 'LAMONGAN',
                datel_baru: 'GRESIK',
                total_orders: 15,
                total_rekon_lensa: 12,
                total_belum_rekon: 3,
                persentase_rekon: 80.0,
                max_statusdate: '2026-11-14T11:51:12.000Z',
                refreshed_at: '2026-11-16T22:46:42.023Z',
            },
        ];

        const mockQuery = vi.fn().mockResolvedValue({ rows: mockRows });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        const result = await repo.getKproRekonSummary();

        expect(result).toEqual(mockRows);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([90]);
        expect(mockQuery.mock.calls[0][0]).toContain('analytics.mv_kpro_rekon_summary');
    });

    it('should apply district and datel filters when provided', async () => {
        const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        await repo.getKproRekonSummary({
            district: 'LAMONGAN',
            datel: 'BOJONEGORO',
            days: 30,
        });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([30, 'LAMONGAN', 'BOJONEGORO']);
        expect(mockQuery.mock.calls[0][0]).toContain('district_tif = $2');
        expect(mockQuery.mock.calls[0][0]).toContain('datel_baru = $3');
    });

    it('should query district rollup KPI correctly', async () => {
        const mockRollup = [
            {
                district_tif: 'LAMONGAN',
                total_orders: 1986,
                total_rekon_lensa: 1540,
                total_belum_rekon: 446,
                persentase_rekon: 77.54,
            },
        ];

        const mockQuery = vi.fn().mockResolvedValue({ rows: mockRollup });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        const result = await repo.getKproRekonDistrictRollup({ days: 60 });

        expect(result).toEqual(mockRollup);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([60]);
        expect(mockQuery.mock.calls[0][0]).toContain('GROUP BY district_tif');
    });

    it('should query datel rollup KPI for a district correctly', async () => {
        const mockDatelRollup = [
            {
                datel_baru: 'GRESIK',
                total_orders: 953,
                total_rekon_lensa: 907,
                total_belum_rekon: 46,
                persentase_rekon: 95.17,
            },
        ];

        const mockQuery = vi.fn().mockResolvedValue({ rows: mockDatelRollup });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        const result = await repo.getKproRekonDatelRollup({ district: 'LAMONGAN', days: 30 });

        expect(result).toEqual(mockDatelRollup);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([30, 'LAMONGAN']);
        expect(mockQuery.mock.calls[0][0]).toContain('GROUP BY datel_baru');
    });

    it('should query daily trend timeseries data with district and datel', async () => {
        const mockTrend = [
            {
                tgl: '2026-11-13',
                total_orders: 45,
                total_rekon_lensa: 35,
                total_belum_rekon: 10,
                persentase_rekon: 77.78,
            },
            {
                tgl: '2026-11-14',
                total_orders: 50,
                total_rekon_lensa: 42,
                total_belum_rekon: 8,
                persentase_rekon: 84.0,
            },
        ];

        const mockQuery = vi.fn().mockResolvedValue({ rows: mockTrend });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        const result = await repo.getKproRekonDailyTrend({
            district: 'LAMONGAN',
            datel: 'GRESIK',
            days: 14,
        });

        expect(result).toEqual(mockTrend);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([14, 'LAMONGAN', 'GRESIK']);
        expect(mockQuery.mock.calls[0][0]).toContain('district_tif = $2');
        expect(mockQuery.mock.calls[0][0]).toContain('datel_baru = $3');
        expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY tgl ASC');
    });

    it('should query Lensa Out performance per warehouse from mv_out_sap_lensa_summary', async () => {
        const mockRows = [
            { key: 1, name: 'SO Karangpilang', total: 168, completed: 167 },
            { key: 2, name: 'SO Gresik', total: 373, completed: 373 },
        ];

        const mockQuery = vi.fn().mockResolvedValue({ rows: mockRows });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        const result = await repo.getLensaOutPerformance(30);

        expect(result).toEqual(mockRows);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([30]);
        expect(mockQuery.mock.calls[0][0]).toContain('analytics.mv_out_sap_lensa_summary');
        expect(mockQuery.mock.calls[0][0]).toContain('GROUP BY warehouse_id, warehouse_name');
    });

    it('should query Lensa Rekon and SLA Rekon performance per warehouse from mv_wo_lensa_rekon_summary', async () => {
        const mockRows = [
            {
                key: 1,
                name: 'SO Karangpilang',
                total_wo: 409,
                completed_rekon: 400,
                completed_sla: 352,
            },
            {
                key: 2,
                name: 'SO Gresik',
                total_wo: 1313,
                completed_rekon: 1267,
                completed_sla: 1122,
            },
        ];

        const mockQuery = vi.fn().mockResolvedValue({ rows: mockRows });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        const result = await repo.getLensaRekonPerformance(30);

        expect(result.rekon).toEqual([
            { key: 1, name: 'SO Karangpilang', total: 409, completed: 400 },
            { key: 2, name: 'SO Gresik', total: 1313, completed: 1267 },
        ]);
        expect(result.slaRekon).toEqual([
            { key: 1, name: 'SO Karangpilang', total: 400, completed: 352 },
            { key: 2, name: 'SO Gresik', total: 1267, completed: 1122 },
        ]);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([30]);
        expect(mockQuery.mock.calls[0][0]).toContain('analytics.mv_wo_lensa_rekon_summary');
    });

    it('should query WO Lensa Rekon summary with optional warehouse and service area filters', async () => {
        const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        await repo.getWoLensaRekonSummary({
            warehouseId: 3,
            serviceArea: 'LAMONGAN',
            days: 14,
        });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([14, 3, 'LAMONGAN']);
        expect(mockQuery.mock.calls[0][0]).toContain('warehouse_id = $2');
        expect(mockQuery.mock.calls[0][0]).toContain('service_area = $3');
    });

    it('should query Out Lensa SAP summary with optional warehouse and service area filters', async () => {
        const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        await repo.getOutLensaSapSummary({
            warehouseId: 2,
            serviceArea: 'GRESIK',
            days: 7,
        });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0][1]).toEqual([7, 2, 'GRESIK']);
        expect(mockQuery.mock.calls[0][0]).toContain('warehouse_id = $2');
        expect(mockQuery.mock.calls[0][0]).toContain('service_area = $3');
    });

    it('should invoke sp_refresh_analytics_mviews procedure', async () => {
        const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
        const mockPool = { query: mockQuery } as unknown as Pool;

        const repo = createAnalyticsRepository(mockPool);
        const result = await repo.refreshAnalyticsMViews();

        expect(mockQuery).toHaveBeenCalledWith('CALL analytics.sp_refresh_analytics_mviews()');
        expect(typeof result.durationMs).toBe('number');
    });
});
