const PRESENCE_PREFIX = 'presence:user:';
const PRESENCE_INDEX_PREFIX = 'presence:index:';
const PRESENCE_TTL_SECONDS = 90;

export function getPresenceSessionKey(nik: string, sessionId: string): string {
    return `${PRESENCE_PREFIX}${encodeURIComponent(nik)}:${encodeURIComponent(sessionId)}`;
}

export function getPresenceIndexKey(nik: string): string {
    return `${PRESENCE_INDEX_PREFIX}${encodeURIComponent(nik)}`;
}

export function hasActivePresence(
    indexMarker: string | null | undefined,
    sessionValues: readonly (string | null | undefined)[]
): boolean {
    return indexMarker === '1' && sessionValues.some(Boolean);
}

export function getPresenceTtlSeconds(): number {
    return PRESENCE_TTL_SECONDS;
}
