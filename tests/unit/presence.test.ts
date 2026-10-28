import { describe, expect, it, vi } from 'vitest';
import {
    clearUserPresence,
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
});
