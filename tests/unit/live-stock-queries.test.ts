import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/repositories/inventory.repository', () => ({
    inventoryRepository: {
        listLiveStockRows: vi.fn(),
    },
}));

vi.mock('@/lib/redis', () => ({
    redis: {},
}));

import { getLiveStockData } from '@/app/(public)/live-stock/_actions/live-stock-queries';
import { liveStockLru } from '@/lib/cache/lru-cache';
import { inventoryRepository } from '@/lib/repositories/inventory.repository';

describe('getLiveStockData with LRU Cache', () => {
    beforeEach(() => {
        liveStockLru.clear();
        vi.clearAllMocks();
    });

    it('queries repository on first call and caches the result for subsequent calls', async () => {
        vi.mocked(inventoryRepository.listLiveStockRows).mockResolvedValueOnce([
            {
                warehouseId: 1,
                warehouseName: 'WH SBY',
                branchName: 'SURABAYA',
                materialId: 101,
                materialCode: 'SOC-ILS',
                materialName: 'SOC ILS',
                materialUnit: 'PCS',
                qtyStock: 50,
                minQty: 10,
                maxQty: 100,
                averageDemandWeekly: 5,
                safetyStockPct: 0.2,
                hasOutMaterialHistory: true,
                policyUpdatedAt: '2026-11-05T00:00:00Z',
            },
        ] as any);

        // First call: hits DB/repository
        const res1 = await getLiveStockData();
        expect(res1.success).toBe(true);
        if (res1.success) {
            expect(res1.data.items).toHaveLength(1);
            expect(res1.data.items[0].material_code).toBe('SOC-ILS');
        }
        expect(inventoryRepository.listLiveStockRows).toHaveBeenCalledTimes(1);

        // Second call: served from L1 LRU cache, 0 additional repository calls
        const res2 = await getLiveStockData();
        expect(res2.success).toBe(true);
        if (res2.success) {
            expect(res2.data.items).toHaveLength(1);
            expect(res2.data.items[0].material_code).toBe('SOC-ILS');
        }
        expect(inventoryRepository.listLiveStockRows).toHaveBeenCalledTimes(1);
    });

    it('returns error when repository throws without leaking details', async () => {
        vi.mocked(inventoryRepository.listLiveStockRows).mockRejectedValueOnce(
            new Error('Connection failure')
        );

        const res = await getLiveStockData();
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error).toBe('Gagal mengambil data stok. Coba beberapa saat lagi.');
        }
    });
});
