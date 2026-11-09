import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    expandMaterialKeywords,
    extractMaterialKeyword,
    extractWarehouse,
    formatStockMarkdown,
    handleStockQuerySkill,
    isStockIntent,
} from '@/lib/services/hermes/skills/stock-query.skill';
import type { HermesChatMessage } from '@/lib/services/hermes/types';

const mockSearchWarehouseStockBalance = vi.fn();
const mockSendChatMessageToHermes = vi.fn();

vi.mock('@/lib/repositories/inventory.repository', () => ({
    inventoryRepository: {
        searchWarehouseStockBalance: (...args: unknown[]) =>
            mockSearchWarehouseStockBalance(...args),
    },
}));

vi.mock('@/lib/services/hermes/hermes-agent.service', () => ({
    sendChatMessageToHermes: (prompt: string, history: HermesChatMessage[]) =>
        mockSendChatMessageToHermes(prompt, history),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('Hermes Stock Query Skill Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Helper Functions', () => {
        it('detects stock intent accurately', () => {
            expect(isStockIntent('bagaimana stock kabel di gudang?')).toBe(true);
            expect(isStockIntent('berapa sisa dropcore?')).toBe(true);
            expect(isStockIntent('cek ketersediaan ont')).toBe(true);
            expect(isStockIntent('ada berapa patchcord di so gresik?')).toBe(true);
            expect(isStockIntent('siapa nama presiden Indonesia?')).toBe(false);
            expect(isStockIntent('tolong buatkan rekon baru')).toBe(false);
        });

        it('extracts warehouse entities and aliases', () => {
            expect(extractWarehouse('di SO Gresik')?.name).toBe('SO Gresik');
            expect(extractWarehouse('gresik dong')?.id).toBe(2);
            expect(extractWarehouse('tolong cek di karangpilang')?.id).toBe(1);
            expect(extractWarehouse('stok di Lamongan')?.id).toBe(3);
            expect(extractWarehouse('di Bojonegoro ya')?.id).toBe(4);
            expect(extractWarehouse('SO Tuban')?.id).toBe(5);
            expect(extractWarehouse('gudang mana saja')?.id).toBeUndefined();
        });

        it('extracts material keyword stripping stopwords', () => {
            expect(extractMaterialKeyword('bagaimana stock kabel di gudang?')).toBe('kabel');
            expect(extractMaterialKeyword('berapa stok dropcore di gresik?')).toBe('dropcore');
            expect(extractMaterialKeyword('cek ketersediaan patch cord')).toBe('patch cord');
            expect(extractMaterialKeyword('stok di gresik')).toBeNull();
        });

        it('expands material synonyms for telecommunication inventory', () => {
            const cableExpanded = expandMaterialKeywords('kabel');
            expect(cableExpanded).toContain('kabel');
            expect(cableExpanded).toContain('cable');
            expect(cableExpanded).toContain('ku fo');
            expect(cableExpanded).toContain('dropcore');

            const dropcoreExpanded = expandMaterialKeywords('dropcore');
            expect(dropcoreExpanded).toContain('dropcore');
            expect(dropcoreExpanded).toContain('dc fo');

            const ontExpanded = expandMaterialKeywords('ont');
            expect(ontExpanded).toContain('ont');
            expect(ontExpanded).toContain('modem');
        });

        it('formats markdown table properly with rows', () => {
            const formatted = formatStockMarkdown('SO Gresik', 'kabel', [
                {
                    materialCode: 'AC-OF-SM-24D',
                    materialName: 'KU FO SM 24 Core',
                    materialUnit: 'M',
                    qtyStock: 3800,
                },
            ]);

            expect(formatted).toContain('Berikut data ketersediaan stok untuk material **kabel**');
            expect(formatted).toContain('SO Gresik');
            expect(formatted).toContain('AC-OF-SM-24D');
            expect(formatted).toContain('3.800');
        });

        it('formats empty state gracefully when no rows found', () => {
            const formatted = formatStockMarkdown('SO Gresik', 'kabel', []);
            expect(formatted).toContain('tidak ditemukan stok material **kabel**');
            expect(formatted).toContain('SO Gresik');
        });
    });

    describe('handleStockQuerySkill Workflow', () => {
        it('ignores messages without stock intent and no active clarification', async () => {
            const result = await handleStockQuerySkill('halo selamat pagi', []);
            expect(result.handled).toBe(false);
            expect(mockSearchWarehouseStockBalance).not.toHaveBeenCalled();
        });

        it('asks clarification when warehouse is missing in the question', async () => {
            const result = await handleStockQuerySkill('bagaimana stock kabel di gudang?', []);
            expect(result.handled).toBe(true);
            expect(result.message).toBeDefined();
            expect(result.message?.content).toContain('kamu mau tahu stok di gudang mana?');
            expect(result.message?.content).toContain('SO Karangpilang');
            expect(result.message?.content).toContain('SO Gresik');
            expect(result.message?.content).toContain('SO Lamongan');
            expect(result.message?.content).toContain('SO Bojonegoro');
            expect(result.message?.content).toContain('SO Tuban');
            // No DB query needed for clarification turn
            expect(mockSearchWarehouseStockBalance).not.toHaveBeenCalled();
        });

        it('handles multi-turn clarification follow-up by resolving material from history', async () => {
            const history: HermesChatMessage[] = [
                {
                    id: '1',
                    role: 'user',
                    content: 'bagaimana stock kabel di gudang?',
                    createdAt: '2026-11-09T00:00:00Z',
                },
                {
                    id: '2',
                    role: 'assistant',
                    content:
                        'Untuk pengecekan stok untuk **kabel**, kamu mau tahu stok di gudang mana?\n\nPilihan gudang MTMS:\n- **SO Karangpilang**\n- **SO Gresik**',
                    createdAt: '2026-11-09T00:00:01Z',
                },
            ];

            mockSearchWarehouseStockBalance.mockResolvedValueOnce([
                {
                    warehouseId: 2,
                    warehouseName: 'SO Gresik',
                    branchName: 'Lamongan',
                    materialId: 34,
                    materialCode: 'AC-OF-SM-ADSS-24D',
                    materialName: 'KU FO SM ADSS 24 C G652D Marking Telkom',
                    materialUnit: 'M',
                    qtyStock: 3800,
                },
            ]);

            mockSendChatMessageToHermes.mockResolvedValueOnce({
                id: 'asst-resp',
                role: 'assistant',
                content: 'Stok kabel di SO Gresik tersedia 3.800 M.',
                createdAt: '2026-11-09T00:00:03Z',
            });

            const result = await handleStockQuerySkill('di Gresik', history);
            expect(result.handled).toBe(true);
            expect(result.message?.content).toBe('Stok kabel di SO Gresik tersedia 3.800 M.');
            expect(mockSearchWarehouseStockBalance).toHaveBeenCalledWith(
                2,
                expect.arrayContaining(['kabel', 'ku fo']),
                15
            );
        });

        it('handles direct specific query with both material and warehouse in single message', async () => {
            mockSearchWarehouseStockBalance.mockResolvedValueOnce([
                {
                    warehouseId: 5,
                    warehouseName: 'SO Tuban',
                    branchName: 'Lamongan',
                    materialId: 16,
                    materialCode: 'AC-OF-SM-1-3SL',
                    materialName: 'DC FO aerial 1 Core SM G657A 3 Sling',
                    materialUnit: 'M',
                    qtyStock: 12000,
                },
            ]);

            mockSendChatMessageToHermes.mockResolvedValueOnce({
                id: 'asst-resp-tuban',
                role: 'assistant',
                content: 'Berikut stok dropcore di SO Tuban: 12.000 M.',
                createdAt: '2026-11-09T00:00:03Z',
            });

            const result = await handleStockQuerySkill('berapa stok dropcore di SO Tuban?', []);
            expect(result.handled).toBe(true);
            expect(mockSearchWarehouseStockBalance).toHaveBeenCalledWith(
                5,
                expect.arrayContaining(['dropcore', 'dc fo']),
                15
            );
            expect(result.message?.content).toContain('12.000 M');
        });

        it('falls back to deterministic markdown when Hermes LLM summarizer throws error or times out', async () => {
            mockSearchWarehouseStockBalance.mockResolvedValueOnce([
                {
                    warehouseId: 3,
                    warehouseName: 'SO Lamongan',
                    branchName: 'Lamongan',
                    materialId: 39,
                    materialCode: 'AD-SC',
                    materialName: 'Adaptor SC',
                    materialUnit: 'PC',
                    qtyStock: 150,
                },
            ]);

            mockSendChatMessageToHermes.mockRejectedValueOnce(
                new Error('MTMS Agent membutuhkan waktu terlalu lama untuk merespons (timeout).')
            );

            const result = await handleStockQuerySkill('cek stok adaptor di Lamongan', []);
            expect(result.handled).toBe(true);
            expect(result.message?.content).toContain('Berikut data ketersediaan stok');
            expect(result.message?.content).toContain('SO Lamongan');
            expect(result.message?.content).toContain('AD-SC');
            expect(result.message?.content).toContain('150');
        });

        it('returns polite error message when database query fails', async () => {
            mockSearchWarehouseStockBalance.mockRejectedValueOnce(new Error('DB connection reset'));

            const result = await handleStockQuerySkill('berapa stok kabel di Gresik?', []);
            expect(result.handled).toBe(true);
            expect(result.message?.content).toContain('Mohon maaf, terjadi kendala teknis');
            expect(result.message?.content).toContain('SO Gresik');
        });
    });
});

