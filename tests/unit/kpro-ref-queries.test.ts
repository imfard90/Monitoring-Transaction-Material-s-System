import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/db/db', () => ({
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
}));

vi.mock('@/lib/repositories/kpro.repository', () => ({
    kproRepository: {
        getLastSyncInfo: vi.fn().mockResolvedValue({
            lastUpdatedAt: new Date('2026-11-14T10:00:00Z'),
            totalRecords: 16000,
            lastJobStatus: 'COMPLETED',
        }),
    },
}));

import { getKproRefList } from '@/app/(DashboardLayout)/reference/kpro-ref/_actions/kpro-ref-queries';

describe('K-Pro Ref Queries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSessionUser.mockResolvedValue({
            user: { id: 'user-1', name: 'Admin', role: 'admin' },
            nik: '906627',
            isStaff: false,
            warehouseIds: [],
        });
    });

    it('should fail with error if getSessionUser throws', async () => {
        mockGetSessionUser.mockRejectedValueOnce(new Error('Unauthorized'));

        const result = await getKproRefList();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unauthorized');
    });

    it('should query K-PRO ref list with district_tif = LAMONGAN and 90-day filter', async () => {
        // Query 1: datel options
        mockPoolQuery.mockResolvedValueOnce({
            rows: [{ datel_baru: 'GRESIK' }, { datel_baru: 'LAMONGAN' }],
        });

        // Query 2: count
        mockPoolQuery.mockResolvedValueOnce({
            rows: [{ total: '42' }],
        });

        // Query 3: items
        mockPoolQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: '101',
                    status_update: new Date('2026-11-14T08:00:00Z'),
                    wonum: 'WO010101',
                    scorderno: 'DGPS261021154146513184580-AOi4261021034146950c2bc90_123',
                    sto: 'GSK',
                    servicenum: '152422007264',
                    package_name: '200 Mbps Internet',
                    datel_baru: 'GRESIK',
                    rekon_lensa: true,
                },
            ],
        });

        const result = await getKproRefList({ page: 1, pageSize: 20 });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data?.total).toBe(42);
        expect(result.data?.datelOptions).toEqual(['GRESIK', 'LAMONGAN']);
        expect(result.data?.items.length).toBe(1);

        const item = result.data?.items[0];
        expect(item?.wonum).toBe('WO010101');
        expect(item?.sto).toBe('GSK');
        expect(item?.rekon_lensa).toBe(true);
        expect(item?.nte).toBe('Coming Soon');

        // Verify count query contains district_tif = LAMONGAN and 90 days interval
        const countQuery = mockPoolQuery.mock.calls[1][0] as string;
        expect(countQuery).toContain("k.district_tif = 'LAMONGAN'");
        expect(countQuery).toContain("k.statusdate >= NOW() - INTERVAL '90 days'");
    });

    it('should apply datel_baru filter when specified', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // datel options
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: '10' }] }); // count
        mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // data

        await getKproRefList({ datelFilter: 'LAMONGAN' });

        const countQuery = mockPoolQuery.mock.calls[1][0] as string;
        const countParams = mockPoolQuery.mock.calls[1][1] as unknown[];

        expect(countQuery).toContain('k.datel_baru = $1');
        expect(countParams).toContain('LAMONGAN');
    });

    it('should apply search filter for wonum, scorderno, sto, servicenum, package_name', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // datel options
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] }); // count
        mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // data

        await getKproRefList({ search: 'WO0101' });

        const countQuery = mockPoolQuery.mock.calls[1][0] as string;
        const countParams = mockPoolQuery.mock.calls[1][1] as unknown[];

        expect(countQuery).toContain('k.wonum ILIKE');
        expect(countQuery).toContain('k.scorderno ILIKE');
        expect(countQuery).toContain('k.sto ILIKE');
        expect(countParams).toContain('%WO0101%');
    });
});
