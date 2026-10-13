import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSqlExecute = vi.fn();
const mockSqlCalls: Array<{ strings: TemplateStringsArray; values: unknown[] }> = [];
const mockDbSelectFrom = vi.fn();

vi.mock('kysely', () => {
    const fakeSql = (strings: TemplateStringsArray, ...values: any[]) => {
        mockSqlCalls.push({ strings, values });
        return {
            strings,
            values,
            execute: mockSqlExecute,
        };
    };
    return {
        sql: fakeSql,
    };
});

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: (...args: any[]) => mockDbSelectFrom(...args),
    },
}));

const { createInventoryRepository, inventoryRepository } = await import(
    '@/lib/repositories/inventory.repository'
);

describe('InventoryRepository Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSqlCalls.length = 0;
    });

    it('exports a singleton inventoryRepository instance', () => {
        expect(inventoryRepository).toBeDefined();
        expect(typeof inventoryRepository.createOutSap).toBe('function');
        expect(typeof inventoryRepository.submitRekonIntech).toBe('function');
    });

    it('createOutSap invokes sp_create_out_sap and formats result', async () => {
        mockSqlExecute.mockResolvedValueOnce({
            rows: [{ p_header_id: '42', p_id_trx: 'TRX-OUT-KP-NIK123-26100001' }],
        });

        const repo = createInventoryRepository({} as any);
        const result = await repo.createOutSap({
            warehouseId: 1,
            nikTeknisi: 'NIK123',
            nameSa: 'SA-A',
            idReservasi: 'RES-001',
            sapNumber: 'SAP-101',
            requestId: 'REQ-55',
            createdBy: 'USER01',
            items: [{ designator_id: 10, qty_req: 5, unit_price: 1500 }],
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            headerId: 42,
            idTrx: 'TRX-OUT-KP-NIK123-26100001',
        });
    });

    it('recordSapOut invokes sp_sap_out with parameters', async () => {
        mockSqlExecute.mockResolvedValueOnce({ rows: [] });

        const repo = createInventoryRepository({} as any);
        await repo.recordSapOut({
            headerId: 100,
            warehouseId: 2,
            createdBy: 'NIK_STAFF',
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
    });

    it('createInOutTag invokes sp_create_inout_tag and returns id_trx', async () => {
        mockSqlExecute.mockResolvedValueOnce({
            rows: [{ p_id_trx: 'TRX-TAG-KP-SBY-26100005' }],
        });

        const repo = createInventoryRepository({} as any);
        const idTrx = await repo.createInOutTag({
            fromWhId: 1,
            toWhId: 2,
            cost: 50000,
            items: [{ designator_id: 10, qty: 2 }],
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
        expect(idTrx).toBe('TRX-TAG-KP-SBY-26100005');
    });

    it('updateInOutTag invokes sp_update_inout_tag with action payload', async () => {
        mockSqlExecute.mockResolvedValueOnce({ rows: [] });

        const repo = createInventoryRepository({} as any);
        await repo.updateInOutTag({
            headerId: 55,
            actionType: 'send',
            actionId: 'SEND-01',
            items: [{ designator_id: 10, qty: 2 }],
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
        const call = mockSqlCalls.at(-1);
        expect(call?.strings.join('?')).toContain('CALL inventory.sp_update_inout_tag');
        expect(call?.strings[1]).toContain('::integer');
        expect(call?.values).toEqual([55, 'send', 'SEND-01', '[{"designator_id":10,"qty":2}]']);
    });

    it('updateInOutTag sends accept ID as the action ID for the accept action', async () => {
        mockSqlExecute.mockResolvedValueOnce({ rows: [] });

        const repo = createInventoryRepository({} as any);
        await repo.updateInOutTag({
            headerId: 55,
            actionType: 'accept',
            actionId: 'ACCEPT-01',
            items: [{ designator_id: 10, qty: 2 }],
        });

        const call = mockSqlCalls.at(-1);
        expect(call?.strings.join('?')).toContain('CALL inventory.sp_update_inout_tag');
        expect(call?.strings[1]).toContain('::integer');
        expect(call?.strings[2]).toContain('::varchar');
        expect(call?.values).toEqual([55, 'accept', 'ACCEPT-01', '[{"designator_id":10,"qty":2}]']);
    });

    it('recordReturnMaterial invokes sp_return_material with header and accept ID', async () => {
        mockSqlExecute.mockResolvedValueOnce({ rows: [] });

        const repo = createInventoryRepository({} as any);
        await repo.recordReturnMaterial({
            headerId: 77,
            acceptId: 'ACC-77',
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
    });

    it('editTransactionUsed invokes sp_edit_transaction_used with 7 parameters', async () => {
        mockSqlExecute.mockResolvedValueOnce({ rows: [] });

        const repo = createInventoryRepository({} as any);
        await repo.editTransactionUsed({
            usedItemId: 10,
            usedHeaderId: 20,
            sapOutItemId: 30,
            designatorId: 40,
            newQty: 5,
            oldQty: 3,
            createdBy: 'NIK_SUPER',
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
    });

    it('recordRekonLensa invokes sp_record_rekon_lensa_v2', async () => {
        mockSqlExecute.mockResolvedValueOnce({ rows: [] });

        const repo = createInventoryRepository({} as any);
        await repo.recordRekonLensa({
            idTrx: 'TRX-USED-LENSA-01',
            idPemakaian: 'PEM-01',
            woNumber: 'WO-99',
            woType: 'psb',
            nikTeknisi: 'TKN01',
            nameGudang: 'WH-A',
            nameSa: 'SA-A',
            notes: 'Test note',
            createdBy: 'NIK01',
            materials: [
                {
                    out_sap: 'SAP-1',
                    designator_id: 'DC-01',
                    qty: 1,
                    unit_price: 100,
                },
            ],
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
    });

    it('submitRekonIntech invokes sp_submit_rekon_intech', async () => {
        mockSqlExecute.mockResolvedValueOnce({ rows: [] });

        const repo = createInventoryRepository({} as any);
        await repo.submitRekonIntech({
            idTrx: 'TRX-USED-01',
            nik: 'TKN01',
            sapOutId: '10',
            woNumber: 'WO-10',
            woType: 'psb',
            nameSa: 'SA-A',
            nameWh: 'WH-A',
            createdBy: 'STAFF01',
            items: [
                {
                    designator_id: 1,
                    sap_out_item_id: 2,
                    qty: 3,
                    notes: null,
                },
            ],
        });

        expect(mockSqlExecute).toHaveBeenCalledTimes(1);
    });

    it('isInternalWarehouse returns true when warehouse branch matches currentBranch', async () => {
        mockDbSelectFrom.mockReturnValue({
            where: () => ({
                select: () => ({
                    executeTakeFirst: vi.fn().mockResolvedValue({ branch: 'Branch Surabaya' }),
                }),
            }),
        });

        const repo = createInventoryRepository({ selectFrom: mockDbSelectFrom } as any);
        const isInternal = await repo.isInternalWarehouse(1, 'Branch Surabaya');

        expect(isInternal).toBe(true);
    });

    it('isInternalWarehouse returns false when warehouse branch differs', async () => {
        mockDbSelectFrom.mockReturnValue({
            where: () => ({
                select: () => ({
                    executeTakeFirst: vi.fn().mockResolvedValue({ branch: 'Branch Malang' }),
                }),
            }),
        });

        const repo = createInventoryRepository({ selectFrom: mockDbSelectFrom } as any);
        const isInternal = await repo.isInternalWarehouse(1, 'Branch Surabaya');

        expect(isInternal).toBe(false);
    });
});
