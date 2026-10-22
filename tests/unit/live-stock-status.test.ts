import { describe, expect, it } from 'vitest';
import {
    calculateDaysUntilRunout,
    computeStockStatus,
    groupByMaterial,
    locationKey,
    type StockItem,
    warehouseLocation,
} from '@/app/(public)/live-stock/_lib/stock-status';

describe('computeStockStatus', () => {
    it('menandai kritis saat qty <= min_qty', () => {
        expect(computeStockStatus(5, 5, 100, 10, 50)).toBe('critical');
        expect(computeStockStatus(3, 5, 100, 10, 50)).toBe('critical');
    });

    it('menandai rendah saat qty <= avg demand x safety %', () => {
        expect(computeStockStatus(4, 2, 100, 10, 50)).toBe('low');
    });

    it('menandai overstock saat qty >= max_qty', () => {
        expect(computeStockStatus(100, 5, 100, 10, 50)).toBe('overstock');
    });

    it('menandai normal bila tidak ada ambang yang dilanggar', () => {
        expect(computeStockStatus(50, 5, 100, 10, 50)).toBe('normal');
    });

    it('mengabaikan policy null atau nol', () => {
        expect(computeStockStatus(0, null, null, null, null)).toBe('normal');
        expect(computeStockStatus(10, 0, 0, 0, 0)).toBe('normal');
    });
});

describe('calculateDaysUntilRunout', () => {
    it('mengembalikan null tanpa history material keluar', () => {
        expect(calculateDaysUntilRunout(50, 7, false)).toBeNull();
    });

    it('menghitung hari dari demand mingguan', () => {
        expect(calculateDaysUntilRunout(50, 7, true)).toBe(50);
    });

    it('mengembalikan null saat demand tidak tersedia', () => {
        expect(calculateDaysUntilRunout(50, null, true)).toBeNull();
        expect(calculateDaysUntilRunout(50, 0, true)).toBeNull();
    });
});

describe('locationKey', () => {
    it('menyamakan nama gudang DB dan Google Sheets', () => {
        expect(locationKey('SO Karang Pilang')).toBe('karangpilang');
        expect(locationKey('SO Karangpilang')).toBe('karangpilang');
        expect(locationKey('SO Bojonegoro')).toBe('bojonegoro');
    });

    it('membedakan gudang non-MTMS', () => {
        expect(locationKey('Denpasar')).toBe('denpasar');
        expect(locationKey('Surabaya Kebalen')).toBe('surabayakebalen');
    });
});

const stockRow = (overrides: Partial<StockItem>): StockItem => ({
    warehouse_id: 1,
    warehouse_name: 'SO Karangpilang',
    branch_name: 'Lamongan',
    material_id: 10,
    material_code: 'ABC-1',
    material_name: 'Kabel Tembaga',
    material_unit: 'm',
    qty_stock: 0,
    min_qty: null,
    max_qty: null,
    average_demand_weekly: null,
    safety_stock_pct: null,
    has_out_material_history: true,
    stock_status: 'normal',
    ...overrides,
});

describe('groupByMaterial', () => {
    it('menjumlahkan stok dan hitung gudang per material', () => {
        const groups = groupByMaterial([
            stockRow({ warehouse_id: 1, qty_stock: 30 }),
            stockRow({ warehouse_id: 2, warehouse_name: 'SO Gresik', qty_stock: 12 }),
            stockRow({ material_code: 'XYZ-9', material_id: 11, qty_stock: 5 }),
        ]);

        expect(groups).toHaveLength(2);
        const abc = groups.find((g) => g.material_code === 'ABC-1');
        expect(abc?.total_qty).toBe(42);
        expect(abc?.warehouse_count).toBe(2);
    });

    it('menandai history keluar bila salah satu gudang punya history', () => {
        const [group] = groupByMaterial([
            stockRow({ warehouse_id: 1, has_out_material_history: false }),
            stockRow({ warehouse_id: 2, has_out_material_history: true }),
        ]);

        expect(group.has_out_material_history).toBe(true);
    });

    it('mengurutkan detail gudang berdasarkan nama lokasi', () => {
        const [group] = groupByMaterial([
            stockRow({ warehouse_id: 5, warehouse_name: 'SO Tuban' }),
            stockRow({ warehouse_id: 1, warehouse_name: 'SO Karangpilang' }),
        ]);

        expect(group.warehouses.map((w) => warehouseLocation(w.warehouse_name))).toEqual([
            'Karangpilang',
            'Tuban',
        ]);
    });
});
