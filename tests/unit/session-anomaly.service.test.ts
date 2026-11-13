import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn().mockResolvedValue('OK');
const mockRedisDel = vi.fn().mockResolvedValue(1);

vi.mock('@/lib/redis', () => ({
    redis: {
        get: (...args: unknown[]) => mockRedisGet(...args),
        set: (...args: unknown[]) => mockRedisSet(...args),
        del: (...args: unknown[]) => mockRedisDel(...args),
    },
}));

const mockPoolQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
vi.mock('@/lib/db/db', () => ({
    pool: {
        query: (...args: unknown[]) => mockPoolQuery(...args),
    },
}));

const mockLogAuthEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/security/auth-audit.service', () => ({
    logAuthEvent: (...args: unknown[]) => mockLogAuthEvent(...args),
}));

vi.mock('@/lib/logger', () => ({
    securityLogger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

const {
    parseUserAgentFamilies,
    extractNetworkContext,
    recordSessionBaseline,
    validateSessionIntegrity,
} = await import('@/lib/security/session-anomaly.service');

describe('session-anomaly.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('parseUserAgentFamilies', () => {
        it('identifies Android Chrome correctly', () => {
            const ua =
                'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';
            const res = parseUserAgentFamilies(ua);
            expect(res.osFamily).toBe('Android');
            expect(res.browserFamily).toBe('Chrome');
        });

        it('identifies iOS Safari correctly', () => {
            const ua =
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
            const res = parseUserAgentFamilies(ua);
            expect(res.osFamily).toBe('iOS');
            expect(res.browserFamily).toBe('Safari');
        });

        it('identifies Windows Edge correctly', () => {
            const ua =
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.144';
            const res = parseUserAgentFamilies(ua);
            expect(res.osFamily).toBe('Windows');
            expect(res.browserFamily).toBe('Edge');
        });

        it('identifies macOS Firefox correctly', () => {
            const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
            const res = parseUserAgentFamilies(ua);
            expect(res.osFamily).toBe('macOS');
            expect(res.browserFamily).toBe('Firefox');
        });

        it('identifies automated tools and scrapers as Automated', () => {
            expect(parseUserAgentFamilies('curl/8.4.0').browserFamily).toBe('Automated');
            expect(parseUserAgentFamilies('python-requests/2.31.0').browserFamily).toBe('Automated');
            expect(parseUserAgentFamilies('PostmanRuntime/7.36.0').browserFamily).toBe('Automated');
        });
    });

    describe('extractNetworkContext', () => {
        it('prioritizes cf-connecting-ip and cf-ipcountry from Cloudflare/Caddy', () => {
            const headers = new Headers({
                'cf-connecting-ip': '114.125.10.20',
                'cf-ipcountry': 'id',
                'user-agent': 'Chrome/120',
                'x-forwarded-for': '10.0.0.1, 114.125.10.20',
            });
            const net = extractNetworkContext(headers);
            expect(net.ipAddress).toBe('114.125.10.20');
            expect(net.country).toBe('ID');
            expect(net.userAgent).toBe('Chrome/120');
        });
    });

    describe('recordSessionBaseline', () => {
        it('writes baseline JSON to Redis with 10-hour TTL', async () => {
            const headers = new Headers({
                'cf-connecting-ip': '114.125.10.20',
                'cf-ipcountry': 'ID',
                'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0',
            });

            await recordSessionBaseline('sess-123', {
                userId: 'user-1',
                nik: '12345',
                headers,
            });

            expect(mockRedisSet).toHaveBeenCalledWith(
                'auth:session-baseline:sess-123',
                expect.stringContaining('"osFamily":"Android"'),
                'EX',
                36000
            );
        });
    });

    describe('validateSessionIntegrity', () => {
        const mockSession = {
            id: 'sess-abc',
            userId: 'user-1',
            token: 'token-secret-123',
            user: { nik: '12345' },
        };

        it('allows normal cellular IP hopping for field technician on Android Chrome', async () => {
            const baseline = {
                sessionId: 'sess-abc',
                userId: 'user-1',
                nik: '12345',
                initialIp: '114.125.1.1',
                currentIp: '114.125.1.1',
                country: 'ID',
                browserFamily: 'Chrome',
                osFamily: 'Android',
                createdAt: Date.now() - 600000,
                lastSeenAt: Date.now() - 30000,
            };
            mockRedisGet.mockResolvedValueOnce(JSON.stringify(baseline));

            const newHeaders = new Headers({
                'cf-connecting-ip': '114.124.8.9', // Different cellular subnet
                'cf-ipcountry': 'ID',
                'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0',
            });

            const res = await validateSessionIntegrity(mockSession, newHeaders);
            expect(res.allowed).toBe(true);
            expect(mockPoolQuery).not.toHaveBeenCalled();
            expect(mockRedisDel).not.toHaveBeenCalled();
        });

        it('blocks and terminates session when OS jumps from Windows to iOS (Cross-OS Hijack)', async () => {
            const baseline = {
                sessionId: 'sess-abc',
                userId: 'user-1',
                nik: '12345',
                initialIp: '180.244.1.1',
                currentIp: '180.244.1.1',
                country: 'ID',
                browserFamily: 'Chrome',
                osFamily: 'Windows',
                createdAt: Date.now() - 600000,
                lastSeenAt: Date.now() - 30000,
            };
            mockRedisGet.mockResolvedValueOnce(JSON.stringify(baseline));

            const hijackedHeaders = new Headers({
                'cf-connecting-ip': '180.244.1.1',
                'cf-ipcountry': 'ID',
                'user-agent':
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
            });

            await expect(validateSessionIntegrity(mockSession, hijackedHeaders)).rejects.toThrow(
                'Sesi dihentikan demi keamanan karena terdeteksi anomali perangkat.'
            );

            expect(mockRedisDel).toHaveBeenCalledWith('token-secret-123');
            expect(mockRedisDel).toHaveBeenCalledWith('auth:session-baseline:sess-abc');
            expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM auth.session'), [
                'sess-abc',
            ]);
            expect(mockLogAuthEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'SESSION_HIJACK_DETECTED',
                    status: 'BLOCKED',
                })
            );
        });

        it('blocks and terminates session when browser jumps to Automated curl script', async () => {
            const baseline = {
                sessionId: 'sess-abc',
                userId: 'user-1',
                nik: '12345',
                initialIp: '180.244.1.1',
                currentIp: '180.244.1.1',
                country: 'ID',
                browserFamily: 'Chrome',
                osFamily: 'Windows',
                createdAt: Date.now() - 600000,
                lastSeenAt: Date.now() - 30000,
            };
            mockRedisGet.mockResolvedValueOnce(JSON.stringify(baseline));

            const curlHeaders = new Headers({
                'cf-connecting-ip': '180.244.1.1',
                'cf-ipcountry': 'ID',
                'user-agent': 'curl/8.4.0',
            });

            await expect(validateSessionIntegrity(mockSession, curlHeaders)).rejects.toThrow();
            expect(mockLogAuthEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'SESSION_HIJACK_DETECTED',
                    status: 'BLOCKED',
                })
            );
        });

        it('blocks and terminates session on impossible travel across countries within 10 minutes', async () => {
            const baseline = {
                sessionId: 'sess-abc',
                userId: 'user-1',
                nik: '12345',
                initialIp: '180.244.1.1',
                currentIp: '180.244.1.1',
                country: 'ID',
                browserFamily: 'Chrome',
                osFamily: 'Windows',
                createdAt: Date.now() - 600000,
                lastSeenAt: Date.now() - 600000, // 10 minutes ago
            };
            mockRedisGet.mockResolvedValueOnce(JSON.stringify(baseline));

            const foreignHeaders = new Headers({
                'cf-connecting-ip': '45.33.2.1',
                'cf-ipcountry': 'DE', // Germany
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            });

            await expect(validateSessionIntegrity(mockSession, foreignHeaders)).rejects.toThrow(
                'perpindahan lokasi geografis yang mencurigakan'
            );

            expect(mockLogAuthEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'SESSION_IMPOSSIBLE_TRAVEL',
                    status: 'BLOCKED',
                })
            );
        });

        it('fails open gracefully if Redis connection errors occur', async () => {
            mockRedisGet.mockRejectedValueOnce(new Error('Redis connection timeout'));

            const headers = new Headers({
                'cf-connecting-ip': '114.125.1.1',
                'cf-ipcountry': 'ID',
                'user-agent': 'Chrome/120',
            });

            const res = await validateSessionIntegrity(mockSession, headers);
            expect(res.allowed).toBe(true);
        });
    });
});

