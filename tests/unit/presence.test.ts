import { describe, expect, it, vi } from 'vitest';
import {
    batchGetUsersOnlineStatus,
    clearUserPresence,
    countActiveOnlineUsers,
    getPresenceIndexKey,
    getPresenceSessionKey,
    getPresenceTtlSeconds,
    hasActivePresence,
    touchUserPresence,
} from '@/lib/presence';

describe('presence keys', () => {
    it('isolates each session while grouping keys by NIK', () => {
        expect(getPresenceSessionKey('12345', 'session-a')).toBe('presence:user:12345:session-a');
        expect(getPresenceSessionKey('12345', 'session-b')).not.toBe(
            getPresenceSessionKey('12345', 'session-a')
        );
        expect(getPresenceIndexKey('12345')).toBe('presence:index:12345');
    });

    it('encodes NIK delimiters and keeps session ownership distinct', () => {
        expect(getPresenceSessionKey('12:45', 'session-a')).toBe('presence:user:12%3A45:session-a');
        expect(getPresenceIndexKey('12:45')).toBe('presence:index:12%3A45');
    });

    it('considers a user online when any indexed session has a live heartbeat', () => {
        expect(hasActivePresence('1', [null, 'session-b'])).toBe(true);
        expect(hasActivePresence('1', [null, null])).toBe(false);
        expect(hasActivePresence(null, ['session-a'])).toBe(false);
    });

    it('uses activity-based TTL of 300 seconds (5 minutes)', () => {
        expect(getPresenceTtlSeconds()).toBe(300);
    });

    it('touchUserPresence executes pipeline with index and session keys', async () => {
        const mockSet = vi.fn();
        const mockExec = vi.fn().mockResolvedValue([null, null]);
        const mockPipeline = vi.fn().mockReturnValue({
            set: mockSet,
            exec: mockExec,
        });

        const mockRedis = {
            pipeline: mockPipeline,
            set: vi.fn(),
            del: vi.fn(),
        };

        await touchUserPresence(mockRedis, '99999', 'sess-123', 300);

        expect(mockPipeline).toHaveBeenCalled();
        expect(mockSet).toHaveBeenCalledWith('presence:index:99999', '1', 'EX', 300);
        expect(mockSet).toHaveBeenCalledWith('presence:user:99999:sess-123', 'sess-123', 'EX', 300);
        expect(mockExec).toHaveBeenCalled();
    });

    it('clearUserPresence deletes index and scanned session keys', async () => {
        const mockDel = vi.fn().mockResolvedValue(1);
        const mockScan = vi
            .fn()
            .mockResolvedValueOnce(['1', ['presence:user:99999:sess-1']])
            .mockResolvedValueOnce(['0', ['presence:user:99999:sess-2']]);

        const mockRedis = {
            del: mockDel,
            set: vi.fn(),
            scan: mockScan,
        };

        await clearUserPresence(mockRedis, '99999');

        expect(mockDel).toHaveBeenCalledWith('presence:index:99999');
        expect(mockScan).toHaveBeenCalledWith('0', 'MATCH', 'presence:user:99999:*', 'COUNT', 100);
        expect(mockDel).toHaveBeenCalledWith(
            'presence:user:99999:sess-1',
            'presence:user:99999:sess-2'
        );
    });

    describe('batchGetUsersOnlineStatus', () => {
        it('returns empty map when given empty array', async () => {
            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                mget: vi.fn(),
            };

            const result = await batchGetUsersOnlineStatus(mockRedis, []);
            expect(result.size).toBe(0);
            expect(mockRedis.mget).not.toHaveBeenCalled();
        });

        it('fetches presence for multiple NIKs in a single mget roundtrip', async () => {
            const mockMget = vi.fn().mockResolvedValue(['1', null, '1']);
            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                mget: mockMget,
            };

            const result = await batchGetUsersOnlineStatus(mockRedis, ['nik-1', 'nik-2', 'nik-3']);

            expect(mockMget).toHaveBeenCalledWith([
                'presence:index:nik-1',
                'presence:index:nik-2',
                'presence:index:nik-3',
            ]);
            expect(result.get('nik-1')).toBe(true);
            expect(result.get('nik-2')).toBe(false);
            expect(result.get('nik-3')).toBe(true);
        });

        it('deduplicates NIKs before calling Redis', async () => {
            const mockMget = vi.fn().mockResolvedValue(['1']);
            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                mget: mockMget,
            };

            const result = await batchGetUsersOnlineStatus(mockRedis, ['nik-1', 'nik-1', '']);

            expect(mockMget).toHaveBeenCalledWith(['presence:index:nik-1']);
            expect(result.get('nik-1')).toBe(true);
        });

        it('falls back to redis.get if mget is not available on the client', async () => {
            const mockGet = vi.fn().mockImplementation(async (key: string) => {
                if (key === 'presence:index:nik-1') return '1';
                return null;
            });
            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                get: mockGet,
            };

            const result = await batchGetUsersOnlineStatus(mockRedis, ['nik-1', 'nik-2']);

            expect(mockGet).toHaveBeenCalledWith('presence:index:nik-1');
            expect(mockGet).toHaveBeenCalledWith('presence:index:nik-2');
            expect(result.get('nik-1')).toBe(true);
            expect(result.get('nik-2')).toBe(false);
        });

        it('returns false for all users safely when redis throws an error', async () => {
            const mockMget = vi.fn().mockRejectedValue(new Error('Redis connection failed'));
            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                mget: mockMget,
            };

            const result = await batchGetUsersOnlineStatus(mockRedis, ['nik-1', 'nik-2']);

            expect(result.get('nik-1')).toBe(false);
            expect(result.get('nik-2')).toBe(false);
        });
    });

    describe('countActiveOnlineUsers', () => {
        it('returns 0 when redis client does not support scan', async () => {
            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
            };
            const count = await countActiveOnlineUsers(mockRedis);
            expect(count).toBe(0);
        });

        it('counts active users by scanning index keys across multiple batches', async () => {
            const mockScan = vi
                .fn()
                .mockResolvedValueOnce(['42', ['presence:index:nik-1', 'presence:index:nik-2']])
                .mockResolvedValueOnce(['0', ['presence:index:nik-3']]);

            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                scan: mockScan,
            };

            const count = await countActiveOnlineUsers(mockRedis);

            expect(count).toBe(3);
            expect(mockScan).toHaveBeenCalledWith('0', 'MATCH', 'presence:index:*', 'COUNT', 200);
            expect(mockScan).toHaveBeenCalledWith('42', 'MATCH', 'presence:index:*', 'COUNT', 200);
        });

        it('deduplicates keys across scan batches if rehashing occurs', async () => {
            const mockScan = vi
                .fn()
                .mockResolvedValueOnce(['42', ['presence:index:nik-1', 'presence:index:nik-2']])
                .mockResolvedValueOnce(['0', ['presence:index:nik-2', 'presence:index:nik-3']]);

            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                scan: mockScan,
            };

            const count = await countActiveOnlineUsers(mockRedis);
            expect(count).toBe(3);
        });

        it('returns 0 safely when scan throws an error', async () => {
            const mockScan = vi.fn().mockRejectedValue(new Error('Redis timeout'));
            const mockRedis = {
                set: vi.fn(),
                del: vi.fn(),
                scan: mockScan,
            };

            const count = await countActiveOnlineUsers(mockRedis);
            expect(count).toBe(0);
        });
    });
});
