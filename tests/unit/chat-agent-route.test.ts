import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSessionUser = vi.fn();
const mockRateLimit = vi.fn();
const mockGetHermesChatHistory = vi.fn();
const mockSaveHermesChatHistory = vi.fn();
const mockClearHermesChatHistory = vi.fn();
const mockSendChatMessageToHermes = vi.fn();
const mockHandleStockQuerySkill = vi.fn();

vi.mock('@/lib/auth-server', () => ({
    getSessionUser: () => mockGetSessionUser(),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: (...args: any[]) => mockRateLimit(...args),
}));

vi.mock('@/lib/services/hermes', () => ({
    getHermesChatHistory: (userId: string) => mockGetHermesChatHistory(userId),
    saveHermesChatHistory: (userId: string, msgs: any[]) => mockSaveHermesChatHistory(userId, msgs),
    clearHermesChatHistory: (userId: string) => mockClearHermesChatHistory(userId),
    sendChatMessageToHermes: (msg: string, history: any[]) => mockSendChatMessageToHermes(msg, history),
    handleStockQuerySkill: (...args: any[]) => mockHandleStockQuerySkill(...args),
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

const { GET, POST, DELETE } = await import('@/app/api/chat-agent/route');

describe('API Route /api/chat-agent Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRateLimit.mockResolvedValue({ success: true });
        mockHandleStockQuerySkill.mockResolvedValue({ handled: false });
    });

    describe('GET /api/chat-agent', () => {
        it('returns 401 when user is not authenticated', async () => {
            mockGetSessionUser.mockResolvedValueOnce(null);
            const res = await GET();
            expect(res.status).toBe(401);
            const json = await res.json();
            expect(json.success).toBe(false);
        });

        it('returns chat history from Redis for authenticated user', async () => {
            mockGetSessionUser.mockResolvedValueOnce({ id: 'usr-123', nik: '12345' });
            const mockHistory = [
                { id: '1', role: 'user', content: 'Halo', createdAt: '2026-11-09T00:00:00Z' },
                { id: '2', role: 'assistant', content: 'Halo juga!', createdAt: '2026-11-09T00:00:01Z' },
            ];
            mockGetHermesChatHistory.mockResolvedValueOnce(mockHistory);

            const res = await GET();
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.messages).toEqual(mockHistory);
            expect(mockGetHermesChatHistory).toHaveBeenCalledWith('12345');
        });
    });

    describe('POST /api/chat-agent', () => {
        it('returns 401 when user is not authenticated', async () => {
            mockGetSessionUser.mockResolvedValueOnce(null);
            const req = new Request('http://localhost/api/chat-agent', {
                method: 'POST',
                body: JSON.stringify({ message: 'Tes' }),
            });
            const res = await POST(req);
            expect(res.status).toBe(401);
        });

        it('returns 429 when rate limit is exceeded', async () => {
            mockGetSessionUser.mockResolvedValueOnce({ id: 'usr-123', nik: '12345' });
            mockRateLimit.mockResolvedValueOnce({ success: false });

            const req = new Request('http://localhost/api/chat-agent', {
                method: 'POST',
                body: JSON.stringify({ message: 'Tes spam' }),
            });
            const res = await POST(req);
            expect(res.status).toBe(429);
            const json = await res.json();
            expect(json.error).toContain('Terlalu banyak permintaan');
        });

        it('returns 400 when message is empty', async () => {
            mockGetSessionUser.mockResolvedValueOnce({ id: 'usr-123', nik: '12345' });

            const req = new Request('http://localhost/api/chat-agent', {
                method: 'POST',
                body: JSON.stringify({ message: '   ' }),
            });
            const res = await POST(req);
            expect(res.status).toBe(400);
            const json = await res.json();
            expect(json.error).toBe('Pesan tidak boleh kosong');
        });

        it('successfully forwards message to Hermes and saves updated history', async () => {
            mockGetSessionUser.mockResolvedValueOnce({ id: 'usr-123', nik: '12345' });
            mockGetHermesChatHistory.mockResolvedValueOnce([]);

            const mockAssistantMsg = {
                id: 'asst-1',
                role: 'assistant',
                content: 'Stok tersedia di gudang Tuban.',
                createdAt: '2026-11-09T00:00:02Z',
            };
            mockSendChatMessageToHermes.mockResolvedValueOnce(mockAssistantMsg);

            const req = new Request('http://localhost/api/chat-agent', {
                method: 'POST',
                body: JSON.stringify({ message: 'Cek stok Tuban' }),
            });
            const res = await POST(req);
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.message).toEqual(mockAssistantMsg);
            expect(json.messages).toHaveLength(2);
            expect(mockSaveHermesChatHistory).toHaveBeenCalledTimes(1);
            expect(mockSaveHermesChatHistory).toHaveBeenCalledWith(
                '12345',
                expect.arrayContaining([
                    expect.objectContaining({ role: 'user', content: 'Cek stok Tuban' }),
                    mockAssistantMsg,
                ])
            );
        });

        it('delegates to stock query skill when skill handles the query', async () => {
            mockGetSessionUser.mockResolvedValueOnce({ id: 'usr-123', nik: '12345' });
            mockGetHermesChatHistory.mockResolvedValueOnce([]);

            const mockSkillMsg = {
                id: 'skill-1',
                role: 'assistant',
                content: 'Berikut data stok kabel di SO Gresik...',
                createdAt: '2026-11-09T00:00:03Z',
            };
            mockHandleStockQuerySkill.mockResolvedValueOnce({
                handled: true,
                message: mockSkillMsg,
            });

            const req = new Request('http://localhost/api/chat-agent', {
                method: 'POST',
                body: JSON.stringify({ message: 'berapa stok kabel di gresik?' }),
            });
            const res = await POST(req);
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.message).toEqual(mockSkillMsg);
            expect(mockSendChatMessageToHermes).not.toHaveBeenCalled();
            expect(mockSaveHermesChatHistory).toHaveBeenCalledWith(
                '12345',
                expect.arrayContaining([
                    expect.objectContaining({ role: 'user', content: 'berapa stok kabel di gresik?' }),
                    mockSkillMsg,
                ])
            );
        });
    });

    describe('DELETE /api/chat-agent', () => {
        it('clears session from Redis for authenticated user', async () => {
            mockGetSessionUser.mockResolvedValueOnce({ id: 'usr-123', nik: '12345' });

            const res = await DELETE();
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(mockClearHermesChatHistory).toHaveBeenCalledWith('12345');
        });
    });
});
