import { describe, expect, it } from 'vitest';
import {
    getPresenceIndexKey,
    getPresenceSessionKey,
    getPresenceTtlSeconds,
    hasActivePresence,
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

    it('uses a TTL longer than two 30-second heartbeat intervals', () => {
        expect(getPresenceTtlSeconds()).toBeGreaterThan(60);
    });
});
