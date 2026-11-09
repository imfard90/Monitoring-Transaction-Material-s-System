import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();

vi.mock('@/lib/redis', () => ({
    redis: {
        get: (...args: any[]) => mockRedisGet(...args),
        set: (...args: any[]) => mockRedisSet(...args),
        del: (...args: any[]) => mockRedisDel(...args),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

const {
    stripReasoningContent,
    sendChatMessageToHermes,
    getHermesChatHistory,
    saveHermesChatHistory,
    clearHermesChatHistory,
} = await import('@/lib/services/hermes');

describe('Hermes Agent Service & Session Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    describe('stripReasoningContent', () => {
        it('removes <think>...</think> tags and their contents', () => {
            const raw = '<think>Let me analyze the database schema...</think>Halo! Ada yang bisa saya bantu?';
            expect(stripReasoningContent(raw)).toBe('Halo! Ada yang bisa saya bantu?');
        });

        it('removes multiline <think> tags', () => {
            const raw = `<think>
Line 1 reasoning
Line 2 reasoning
</think>
Stok material tersedia di gudang.`;
            expect(stripReasoningContent(raw)).toBe('Stok material tersedia di gudang.');
        });

        it('preserves clean text without think tags', () => {
            const clean = 'Sistem MTMS mencatat mutasi material secara realtime.';
            expect(stripReasoningContent(clean)).toBe(clean);
        });

        it('handles empty or whitespace strings', () => {
            expect(stripReasoningContent('')).toBe('');
        });
    });

    describe('hermes-session (Redis with 10-minute sliding TTL)', () => {
        it('returns empty array if no history found in Redis', async () => {
            mockRedisGet.mockResolvedValueOnce(null);
            const history = await getHermesChatHistory('user-1');
            expect(history).toEqual([]);
            expect(mockRedisGet).toHaveBeenCalledWith('hermes:chat:user-1');
        });

        it('returns parsed chat messages from Redis', async () => {
            const saved = [
                { id: '1', role: 'user', content: 'Tes', createdAt: '2026-11-09T00:00:00Z' },
                { id: '2', role: 'assistant', content: 'Siap', createdAt: '2026-11-09T00:00:01Z' },
            ];
            mockRedisGet.mockResolvedValueOnce(JSON.stringify(saved));

            const history = await getHermesChatHistory('user-1');
            expect(history).toEqual(saved);
        });

        it('saves chat messages with 10-minute (600s) TTL', async () => {
            const msgs = [
                { id: '1', role: 'user' as const, content: 'Halo', createdAt: '2026-11-09T00:00:00Z' },
            ];
            await saveHermesChatHistory('user-1', msgs);

            expect(mockRedisSet).toHaveBeenCalledWith(
                'hermes:chat:user-1',
                JSON.stringify(msgs),
                'EX',
                600
            );
        });

        it('clears chat history by deleting Redis key', async () => {
            await clearHermesChatHistory('user-1');
            expect(mockRedisDel).toHaveBeenCalledWith('hermes:chat:user-1');
        });
    });

    describe('sendChatMessageToHermes', () => {
        it('rejects empty user message', async () => {
            await expect(sendChatMessageToHermes('   ')).rejects.toThrow('Pesan tidak boleh kosong.');
        });

        it('calls Hermes completions endpoint and strips reasoning from response', async () => {
            const mockFetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: '<think>Menganalisis permintaan pengguna...</think>Tentu, ini panduan input transaksi.',
                                reasoning_content: 'Internal reasoning tokens that should be ignored',
                            },
                        },
                    ],
                }),
            });

            vi.stubGlobal('fetch', mockFetch);

            const result = await sendChatMessageToHermes('Bagaimana cara input out material?');

            expect(result.role).toBe('assistant');
            expect(result.content).toBe('Tentu, ini panduan input transaksi.');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(callBody.model).toBe('hermes-agent');
            expect(callBody.messages[0].role).toBe('system');
            expect(callBody.messages[1]).toEqual({
                role: 'user',
                content: 'Bagaimana cara input out material?',
            });
        });

        it('handles connection refused error with user-friendly Indonesian message', async () => {
            const mockFetch = vi.fn().mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:20129'));
            vi.stubGlobal('fetch', mockFetch);

            await expect(sendChatMessageToHermes('Halo')).rejects.toThrow(
                'Layanan Hermes Agent di server sedang tidak aktif atau tidak dapat dijangkau.'
            );
        });
    });
});

