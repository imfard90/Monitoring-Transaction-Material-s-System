import { describe, expect, it } from 'vitest';
import { resolveWarehouseId } from '@/app/(DashboardLayout)/form/stock-opname/_utils/pdf-parser';

describe('pdf-parser: resolveWarehouseId', () => {
    it('resolves known warehouse names using the default mapping', () => {
        expect(resolveWarehouseId('WH SO KARANG PILANG')).toBe(1);
        expect(resolveWarehouseId('SO Karangpilang')).toBe(1);
        expect(resolveWarehouseId('WH SO GRESIK')).toBe(2);
        expect(resolveWarehouseId('WH SO LAMONGAN')).toBe(3);
        expect(resolveWarehouseId('WH SO BOJONEGORO')).toBe(4);
        expect(resolveWarehouseId('WH SO TUBAN')).toBe(5);
        expect(resolveWarehouseId('WH SO SURABAYA')).toBe(6);
    });

    it('resolves using master warehouse array when provided', () => {
        const masters = [
            { id: 10, name: 'Gudang Pusat Cikupa' },
            { id: 20, name: 'WH SO Sidoarjo' },
        ];
        expect(resolveWarehouseId('WH SO Sidoarjo', masters)).toBe(20);
        expect(resolveWarehouseId('Gudang Pusat Cikupa', masters)).toBe(10);
    });

    it('returns 0 for unknown warehouse', () => {
        expect(resolveWarehouseId('WH SO UNKNOWN CITY')).toBe(0);
        expect(resolveWarehouseId('')).toBe(0);
    });
});
