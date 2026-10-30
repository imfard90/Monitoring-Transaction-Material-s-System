import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    parseStockOpnamePdf,
    resolveWarehouseId,
} from '@/app/(DashboardLayout)/form/stock-opname/_utils/pdf-parser';

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

describe('pdf-parser: parseStockOpnamePdf on real multi-page PDFs', () => {
    const tmpDir = path.resolve(process.cwd(), 'tmp');

    it('parses Karangpilang (single page data) accurately', async () => {
        const filePath = path.join(tmpDir, 'Karangpilang.pdf');
        if (!fs.existsSync(filePath)) return;

        const buffer = fs.readFileSync(filePath);
        const result = await parseStockOpnamePdf(buffer.buffer);

        expect(result.warehouse_id).toBe(1);
        expect(result.warehouse).toContain('Karang Pilang');
        expect(result.totalRows).toBe(23);

        const precon = result.materials.find((m) => m.material_code === 'AC-OF-SM-1-3SL');
        expect(precon?.saldo_sap).toBe(42570);
    });

    it('parses Tuban (multi-page data) without cross-page collisions', async () => {
        const filePath = path.join(tmpDir, 'Tuban.pdf');
        if (!fs.existsSync(filePath)) return;

        const buffer = fs.readFileSync(filePath);
        const result = await parseStockOpnamePdf(buffer.buffer);

        expect(result.warehouse_id).toBe(5);
        expect(result.warehouse).toContain('Tuban');
        expect(result.totalRows).toBe(57);

        // Specific regression checks
        const ac1 = result.materials.find((m) => m.material_code === 'AC-OF-SM-1-3SL');
        expect(ac1?.saldo_sap).toBe(39734);

        const ac24 = result.materials.find((m) => m.material_code === 'AC-OF-SM-24-SC');
        expect(ac24?.saldo_sap).toBe(2721);

        const rj45 = result.materials.find((m) => m.material_code === 'RJ45-5');
        expect(rj45?.saldo_sap).toBe(80);

        const sc144 = result.materials.find((m) => m.material_code === 'SC-OF-SM-144');
        expect(sc144?.saldo_sap).toBe(12);
    });

    it('parses Bojonegoro (multi-page data with slash codes) accurately', async () => {
        const filePath = path.join(tmpDir, 'Bojonegoro.pdf');
        if (!fs.existsSync(filePath)) return;

        const buffer = fs.readFileSync(filePath);
        const result = await parseStockOpnamePdf(buffer.buffer);

        expect(result.warehouse_id).toBe(4);
        expect(result.warehouse).toContain('Bojonegoro');
        expect(result.totalRows).toBe(58);

        // Specific regression checks
        const ac24 = result.materials.find((m) => m.material_code === 'AC-OF-SM-24-SC');
        expect(ac24?.saldo_sap).toBe(162);

        const clamp = result.materials.find((m) => m.material_code === 'CLAMP-HOOK');
        expect(clamp?.saldo_sap).toBe(191);

        const hdpe = result.materials.find((m) => m.material_code === 'DD-HDPE-40/33');
        expect(hdpe?.saldo_sap).toBe(20);
    });

    it('parses Gresik (multi-page data with empty Volume SO cell) accurately', async () => {
        const filePath = path.join(tmpDir, 'SO SAP GRESIK 30-10-2026.pdf');
        if (!fs.existsSync(filePath)) return;

        const buffer = fs.readFileSync(filePath);
        const result = await parseStockOpnamePdf(buffer.buffer);

        expect(result.warehouse_id).toBe(2);
        expect(result.warehouse).toContain('Gresik');
        expect(result.totalRows).toBe(44);

        // First item check
        const adSc = result.materials.find((m) => m.material_code === 'AD-SC');
        expect(adSc?.saldo_sap).toBe(261);

        // Material with empty Volume SO cell in PDF defaults to 0
        const emptyCellMaterial = result.materials.find(
            (m) => m.material_code === 'AC-OF-SM-ADSS-48D'
        );
        expect(emptyCellMaterial).toBeDefined();
        expect(emptyCellMaterial?.saldo_sap).toBe(0);
        expect(emptyCellMaterial?.material_name).toContain(
            'KU FO SM ADSS 48 C G652D Marking Telkom'
        );

        // Last item check
        const solidL = result.materials.find((m) => m.material_code === 'PS-1-8-SOLID-L');
        expect(solidL?.saldo_sap).toBe(95);
    });
});
