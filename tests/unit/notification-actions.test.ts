import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockExecute = vi.fn();
const mockExecuteTakeFirst = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

// Build chainable query builder mock
const queryChain = {
    leftJoin: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    execute: () => mockExecute(),
    executeTakeFirst: () => mockExecuteTakeFirst(),
};

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn(() => queryChain),
    },
}));

vi.mock('@/lib/warehouse-helper', () => ({
    expandWarehouseAliases: (names: string[]) => names,
}));

import { getPendingNotifications } from '@/app/(DashboardLayout)/_actions/notification-actions';

describe('getPendingNotifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty tanggungan and default categories when staff has no warehouse assigned', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'STAFF01',
            isStaff: true,
            warehouseIds: [],
        });

        const res = await getPendingNotifications();
        expect(res.success).toBe(true);
        expect(res.data?.total).toBe(0);
        expect(res.data?.categories).toHaveLength(4);
        expect(res.data?.urgentItems).toHaveLength(0);
    });

    it('returns error when getSessionUser throws unauthenticated error', async () => {
        mockGetSessionUser.mockRejectedValue(new Error('Unauthorized'));

        const res = await getPendingNotifications();
        expect(res.success).toBe(false);
        expect(res.error).toBe('Unauthorized');
    });

    it('returns calculated counts and formatted urgent items for authorized user', async () => {
        mockGetSessionUser.mockResolvedValue({
            nik: 'ADMIN01',
            isStaff: false,
            warehouseIds: [],
        });

        mockExecuteTakeFirst
            .mockResolvedValueOnce({ total: 3 }) // inout count
            .mockResolvedValueOnce({ total: 2 }) // return count
            .mockResolvedValueOnce({ total: 5 }) // out sap count
            .mockResolvedValueOnce({ total: 4 }); // rekon count

        mockExecute
            .mockResolvedValueOnce([
                {
                    id: 101,
                    id_trx: 'TAG-101',
                    end_status: 'requested',
                    request_time: '2026-11-03T01:00:00Z',
                    from_wh_name: 'Gudang A',
                    to_wh_name: 'Gudang B',
                },
            ]) // inout recent
            .mockResolvedValueOnce([
                {
                    id: 201,
                    id_trx: 'RET-201',
                    nik_teknisi: 'TEK01',
                    technician_name: 'Budi',
                    warehouse_name: 'Gudang A',
                    request_time: '2026-11-03T01:10:00Z',
                    end_status: 'pending',
                },
            ]) // return recent
            .mockResolvedValueOnce([
                {
                    id: 301,
                    reservation_id: 'RES-301',
                    gi_number: 'GI-301',
                    nama_gudang: 'Gudang A',
                    nik_pemakai: 'TEK02',
                    request_time: '2026-11-03T01:15:00Z',
                },
            ]) // out sap recent
            .mockResolvedValueOnce([
                {
                    id: 401,
                    wo_number: 'WO-401',
                    nama_gudang: 'Gudang A',
                    nik_pemakai: 'TEK03',
                    wo_type: 'PSB',
                    request_time: '2026-11-03T01:20:00Z',
                },
            ]); // rekon recent

        const res = await getPendingNotifications();
        expect(res.success).toBe(true);
        expect(res.data?.total).toBe(14); // 3 + 2 + 5 + 4
        expect(res.data?.categories[0].count).toBe(3);
        expect(res.data?.categories[1].count).toBe(2);
        expect(res.data?.categories[2].count).toBe(5);
        expect(res.data?.categories[3].count).toBe(4);
        expect(res.data?.urgentItems).toHaveLength(4);
        // Ordered by time desc: 401 (01:20) should be first
        expect(res.data?.urgentItems[0].title).toBe('WO: WO-401');

        // Subsequent call within TTL returns cached result immediately without DB queries
        const cachedRes = await getPendingNotifications();
        expect(cachedRes.success).toBe(true);
        expect(cachedRes.data?.total).toBe(14);
        expect(cachedRes.data?.urgentItems).toHaveLength(4);
    });
});
