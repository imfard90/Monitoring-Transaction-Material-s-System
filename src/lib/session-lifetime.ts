export const REMEMBERED_SESSION_MAX_AGE_SECONDS = 10 * 60 * 60;
export const UNREMEMBERED_SESSION_MAX_AGE_SECONDS = 60 * 60;

/**
 * Better Auth creates non-remembered sessions with a 24-hour expiry. Clamp those
 * to one hour while preserving the original login time and absolute deadline.
 */
export function enforceAbsoluteSessionLifetime<T extends { createdAt: Date; expiresAt: Date }>(
    session: T
): T {
    const currentLifetimeMs = session.expiresAt.getTime() - session.createdAt.getTime();
    const unrememberedLimitMs = UNREMEMBERED_SESSION_MAX_AGE_SECONDS * 1000;

    if (currentLifetimeMs <= unrememberedLimitMs) return session;

    return {
        ...session,
        expiresAt: new Date(session.createdAt.getTime() + unrememberedLimitMs),
    };
}
