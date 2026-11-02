import { describe, expect, it } from 'vitest';
import {
    buildRekonPayload,
    calculateAvailableStockByCode,
    calculateFifoAllocation,
    calculateWoSufficiency,
    type TechnicianMaterialItem,
    validateAllocationSufficiency,
    type WoLensaRecord,
} from '@/hooks/use-material-fifo-allocation';

describe('use-material-fifo-allocation domain calculations', () => {
    const mockMaterials: TechnicianMaterialItem[] = [
        {
            sap_out_id: 101,
            sap_out_item_id: 1001,
            sap_number: 'SAP-001',
            designator_id: 1,
            material_code: 'FIBER-1C',
            material_name: 'Drop Core 1 Core',
            qty_req: 150,
            qty_used: 50, // 100 available
        },
        {
            sap_out_id: 102,
            sap_out_item_id: 1002,
            sap_number: 'SAP-002',
            designator_id: 1,
            material_code: 'FIBER-1C',
            material_name: 'Drop Core 1 Core',
            qty_req: 200,
            qty_used: 0, // 200 available
        },
        {
            sap_out_id: 103,
            sap_out_item_id: 1003,
            sap_number: 'SAP-003',
            designator_id: 2,
            material_code: 'ONT-PREMIUM',
            material_name: 'Optical Network Terminal',
            qty_req: 2,
            qty_used: 2, // 0 available
        },
    ];

    const mockWos: WoLensaRecord[] = [
        {
            id: 'WO-12345',
            wo_type: 'PASANG_BARU',
            wo_number: 'WO/2026/001',
            pemakaian_id: 'PEM-999',
            tanggal_update: '2026-11-02',
            items: [
                {
                    material_id: 'FIBER-1C',
                    qty_pemakaian: 120,
                    uom: 'MTR',
                },
            ],
        },
        {
            id: 'WO-67890',
            wo_type: 'GANGGUAN',
            wo_number: 'WO/2026/002',
            items: [
                {
                    material_id: 'ONT-PREMIUM',
                    qty_pemakaian: 1,
                    uom: 'PCS',
                },
            ],
        },
    ];

    describe('calculateAvailableStockByCode', () => {
        it('aggregates available quantity correctly and ignores exhausted items', () => {
            const stockMap = calculateAvailableStockByCode(mockMaterials);

            expect(stockMap['FIBER-1C']).toBe(300); // 100 + 200
            expect(stockMap['ONT-PREMIUM']).toBe(0);
        });

        it('returns empty object when no materials provided', () => {
            expect(calculateAvailableStockByCode([])).toEqual({});
        });
    });

    describe('calculateFifoAllocation', () => {
        it('allocates strictly FIFO across sequential batches', () => {
            const selectedWos = new Set(['WO-12345']); // Needs 120 FIBER-1C
            const allocation = calculateFifoAllocation(selectedWos, mockMaterials, mockWos);

            // Batch 1 (item 1001) has 100 available -> all 100 allocated
            expect(allocation['1001']).toBe(100);
            // Batch 2 (item 1002) has 200 available -> remaining 20 allocated
            expect(allocation['1002']).toBe(20);
            // Item 1003 not needed
            expect(allocation['1003']).toBe(0);
        });

        it('returns all zeros when no WO is selected', () => {
            const allocation = calculateFifoAllocation(new Set(), mockMaterials, mockWos);
            expect(allocation).toEqual({});
        });
    });

    describe('calculateWoSufficiency', () => {
        it('evaluates ready when stock is sufficient', () => {
            const stockMap = { 'FIBER-1C': 300 };
            const result = calculateWoSufficiency(mockWos[0], stockMap);

            expect(result.isReady).toBe(true);
            expect(result.totalAllocated).toBe(120);
            expect(result.items[0]).toEqual({
                code: 'FIBER-1C',
                required: 120,
                available: 300,
                uom: 'MTR',
                isOk: true,
            });
        });

        it('evaluates not ready when required stock exceeds available', () => {
            const stockMap = { 'ONT-PREMIUM': 0 };
            const result = calculateWoSufficiency(mockWos[1], stockMap);

            expect(result.isReady).toBe(false);
            expect(result.items[0].isOk).toBe(false);
        });
    });

    describe('validateAllocationSufficiency', () => {
        it('fails validation when no WO is selected', () => {
            const res = validateAllocationSufficiency(new Set(), mockMaterials, mockWos, {});
            expect(res.isValid).toBe(false);
            expect(res.errorMessage).toBe('Pilih minimal 1 WO Lensa untuk direkon');
        });

        it('fails validation when allocated stock is less than required', () => {
            const selectedWos = new Set(['WO-67890']);
            const res = validateAllocationSufficiency(selectedWos, mockMaterials, mockWos, {
                '1003': 0,
            });
            expect(res.isValid).toBe(false);
            expect(res.errorMessage).toContain(
                'Stok material ONT-PREMIUM di tangan teknisi tidak mencukupi'
            );
        });

        it('passes validation when allocation satisfies required quantity', () => {
            const selectedWos = new Set(['WO-12345']);
            const res = validateAllocationSufficiency(selectedWos, mockMaterials, mockWos, {
                '1001': 100,
                '1002': 20,
            });
            expect(res.isValid).toBe(true);
            expect(res.errorMessage).toBeUndefined();
        });
    });

    describe('buildRekonPayload', () => {
        it('constructs atomic stored procedure payload with correct schema', () => {
            const allocated = { '1001': 100, '1002': 20, '1003': 0 };
            const payload = buildRekonPayload(mockWos[0], mockMaterials, allocated);

            expect(payload).toHaveLength(2);
            expect(payload[0]).toEqual({
                sap_out_id: '101',
                sap_out_item_id: '1001',
                sap_number: 'SAP-001',
                name_sa: '',
                name_wh: null,
                designator_id: 1,
                qty: 100,
                wo_type: 'PASANG_BARU',
                wo_number: 'WO/2026/001',
                pemakaian_id: 'PEM-999',
                notes: 'Rekon Lensa WO WO/2026/001',
            });
            expect(payload[1]).toEqual({
                sap_out_id: '102',
                sap_out_item_id: '1002',
                sap_number: 'SAP-002',
                name_sa: '',
                name_wh: null,
                designator_id: 1,
                qty: 20,
                wo_type: 'PASANG_BARU',
                wo_number: 'WO/2026/001',
                pemakaian_id: 'PEM-999',
                notes: 'Rekon Lensa WO WO/2026/001',
            });
        });

        it('returns empty array when selectedWo is null', () => {
            expect(buildRekonPayload(null, mockMaterials, {})).toEqual([]);
        });
    });
});
