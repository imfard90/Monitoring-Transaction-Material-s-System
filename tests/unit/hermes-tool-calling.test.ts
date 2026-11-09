import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeHermesTool } from '@/lib/services/hermes/hermes-tool-executor';
import { sendChatMessageToHermes } from '@/lib/services/hermes/hermes-agent.service';

const mockSearchStockBalances = vi.fn();

vi.mock('@/lib/repositories/inventory.repository', () => ({
    inventoryRepository: {
        searchStockBalances: (...args: unknown[]) => mockSearchStockBalances(...args),
        searchWarehouseStockBalance: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Hermes Tool Calling Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('executeHermesTool', () => {
        it('queries specific warehouse when warehouse_name is specified', async () => {
            mockSearchStockBalances.mockResolvedValueOnce([
                {
                    warehouseId: 3,
                    warehouseName: 'SO Lamongan',
                    branchName: 'Lamongan',
                    materialId: 10,
                    materialCode: 'AC-OF-SM-ADSS-96D',
                    materialName: 'KU FO SM ADSS 96 C G652D Marking Telkom',
                    materialUnit: 'M',
                    qtyStock: 0,
                },
            ]);

            const res = await executeHermesTool(
                'get_material_stock',
                JSON.stringify({
                    material_keyword: 'AC-OF-SM-ADSS-96D',
                    warehouse_name: 'SO Lamongan',
                    check_all_warehouses: false,
                })
            );

            expect(res.status).toBe('success');
            expect(res.cakupan_gudang).toBe('SO Lamongan');
            expect(mockSearchStockBalances).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseId: 3,
                    keywords: expect.arrayContaining(['ac-of-sm-adss-96d']),
                })
            );
            expect(res.total_data).toBe(1);
        });

        it('queries across all warehouses when check_all_warehouses is true', async () => {
            mockSearchStockBalances.mockResolvedValueOnce([
                {
                    warehouseId: 2,
                    warehouseName: 'SO Gresik',
                    branchName: 'Lamongan',
                    materialId: 10,
                    materialCode: 'AC-OF-SM-ADSS-96D',
                    materialName: 'KU FO SM ADSS 96 C G652D Marking Telkom',
                    materialUnit: 'M',
                    qtyStock: 360,
                },
                {
                    warehouseId: 4,
                    warehouseName: 'SO Bojonegoro',
                    branchName: 'Lamongan',
                    materialId: 10,
                    materialCode: 'AC-OF-SM-ADSS-96D',
                    materialName: 'KU FO SM ADSS 96 C G652D Marking Telkom',
                    materialUnit: 'M',
                    qtyStock: 70,
                },
                {
                    warehouseId: 3,
                    warehouseName: 'SO Lamongan',
                    branchName: 'Lamongan',
                    materialId: 10,
                    materialCode: 'AC-OF-SM-ADSS-96D',
                    materialName: 'KU FO SM ADSS 96 C G652D Marking Telkom',
                    materialUnit: 'M',
                    qtyStock: 0,
                },
            ]);

            const res = await executeHermesTool(
                'get_material_stock',
                JSON.stringify({
                    material_keyword: 'AC-OF-SM-ADSS-96D',
                    check_all_warehouses: true,
                })
            );

            expect(res.status).toBe('success');
            expect(res.cakupan_gudang).toBe('Seluruh Gudang MTMS');
            expect(mockSearchStockBalances).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseId: undefined,
                    keywords: expect.arrayContaining(['ac-of-sm-adss-96d']),
                })
            );
            expect(res.total_data).toBe(3);
        });

        it('returns error when arguments are invalid or missing material_keyword', async () => {
            const res = await executeHermesTool('get_material_stock', JSON.stringify({}));
            expect(res.status).toBe('error');
            expect(res.message).toContain('material_keyword');
        });

        it('returns error for unsupported tool name', async () => {
            const res = await executeHermesTool('unknown_tool', '{}');
            expect(res.status).toBe('error');
            expect(res.message).toContain('tidak didukung');
        });
    });

    describe('sendChatMessageToHermes with Tool Calling Loop', () => {
        it('handles tool_calls from Hermes, executes tool, and returns final answer', async () => {
            mockSearchStockBalances.mockResolvedValueOnce([
                {
                    warehouseId: 2,
                    warehouseName: 'SO Gresik',
                    branchName: 'Lamongan',
                    materialId: 10,
                    materialCode: 'AC-OF-SM-ADSS-96D',
                    materialName: 'KU FO SM ADSS 96 C G652D Marking Telkom',
                    materialUnit: 'M',
                    qtyStock: 360,
                },
                {
                    warehouseId: 4,
                    warehouseName: 'SO Bojonegoro',
                    branchName: 'Lamongan',
                    materialId: 10,
                    materialCode: 'AC-OF-SM-ADSS-96D',
                    materialName: 'KU FO SM ADSS 96 C G652D Marking Telkom',
                    materialUnit: 'M',
                    qtyStock: 70,
                },
            ]);

            // First fetch: Hermes asks to call tool 'get_material_stock'
            const toolCallResponse = {
                id: 'resp-1',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        name: 'get_material_stock',
                                        arguments: JSON.stringify({
                                            material_keyword: 'AC-OF-SM-ADSS-96D',
                                            check_all_warehouses: true,
                                        }),
                                    },
                                },
                            ],
                        },
                    },
                ],
            };

            // Second fetch: Hermes generates final response after seeing tool output
            const finalAnswerResponse = {
                id: 'resp-2',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content:
                                'Material AC-OF-SM-ADSS-96D tersedia di SO Gresik (360 M) dan SO Bojonegoro (70 M). Rekomendasi transfer ke SO Gresik.',
                        },
                    },
                ],
            };

            const originalFetch = global.fetch;
            global.fetch = vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => toolCallResponse,
                } as Response)
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => finalAnswerResponse,
                } as Response);

            try {
                const result = await sendChatMessageToHermes(
                    'jika stock AC-OF-SM-ADSS-96D di lamongan habis saya bisa minta kemana'
                );

                expect(result.role).toBe('assistant');
                expect(result.content).toContain('Material AC-OF-SM-ADSS-96D tersedia di SO Gresik');
                expect(mockSearchStockBalances).toHaveBeenCalled();
            } finally {
                global.fetch = originalFetch;
            }
        });
    });
});

