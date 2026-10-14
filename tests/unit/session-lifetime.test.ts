import { describe, expect, it } from 'vitest';
import {
    enforceAbsoluteSessionLifetime,
    REMEMBERED_SESSION_MAX_AGE_SECONDS,
    UNREMEMBERED_SESSION_MAX_AGE_SECONDS,
} from '@/lib/session-lifetime';

describe('absolute session lifetime', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    it('clamps an unremembered session to one hour after its original login time', () => {
        const session = {
            createdAt,
            expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
            id: 'session-1',
        };

        const result = enforceAbsoluteSessionLifetime(session);

        expect(result.expiresAt).toEqual(
            new Date(createdAt.getTime() + UNREMEMBERED_SESSION_MAX_AGE_SECONDS * 1000)
        );
        expect(result.createdAt).toBe(createdAt);
        expect(result.id).toBe('session-1');
    });

    it('leaves sessions at or below the one-hour expiry unchanged', () => {
        const session = {
            createdAt,
            expiresAt: new Date(createdAt.getTime() + UNREMEMBERED_SESSION_MAX_AGE_SECONDS * 1000),
        };

        expect(enforceAbsoluteSessionLifetime(session)).toBe(session);
    });

    it('does not extend a session on repeated enforcement', () => {
        const session = {
            createdAt,
            expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
        };

        const first = enforceAbsoluteSessionLifetime(session);
        const second = enforceAbsoluteSessionLifetime(first);

        expect(second.expiresAt).toEqual(first.expiresAt);
    });

    it('defines the remembered maximum as ten hours', () => {
        expect(REMEMBERED_SESSION_MAX_AGE_SECONDS).toBe(10 * 60 * 60);
    });
});
