const PRESENCE_PREFIX = 'presence:user:';
const PRESENCE_INDEX_PREFIX = 'presence:index:';
// Activity-based passive presence TTL: 300 seconds (5 minutes)
const PRESENCE_TTL_SECONDS = 300;

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

/**
 * Minimal Redis surface required for presence tracking.
 *
 * Typed structurally so the module stays decoupled from the concrete Redis
 * client library while still catching misuse at compile time.
 */
export interface RedisPresenceClient {
    pipeline?: () => {
        set: (key: string, value: string, mode: 'EX', ttlSeconds: number) => unknown;
        exec: () => Promise<unknown>;
    };
    set: (key: string, value: string, mode: 'EX', ttlSeconds: number) => Promise<unknown>;
    del: (...keys: string[]) => Promise<unknown>;
    scan?: (
        cursor: string,
        match: 'MATCH',
        pattern: string,
        count: 'COUNT',
        limit: number
    ) => Promise<[string, string[]]>;
}

/**
 * Touch user presence passively on authenticated activity (server action, request).
 * Sets both the index marker and the per-session presence key with TTL.
 */
export async function touchUserPresence(
    redisClient: RedisPresenceClient,
    nik: string,
    sessionId?: string | null,
    ttlSeconds = PRESENCE_TTL_SECONDS
): Promise<void> {
    if (!nik) return;
    try {
        const sessionKey = getPresenceSessionKey(nik, sessionId || 'activity');
        const indexKey = getPresenceIndexKey(nik);
        const resolvedSessionId = sessionId || 'activity';

        if (typeof redisClient.pipeline === 'function') {
            const pipeline = redisClient.pipeline();
            pipeline.set(indexKey, '1', 'EX', ttlSeconds);
            pipeline.set(sessionKey, resolvedSessionId, 'EX', ttlSeconds);
            await pipeline.exec();
        } else {
            await redisClient.set(indexKey, '1', 'EX', ttlSeconds);
            await redisClient.set(sessionKey, resolvedSessionId, 'EX', ttlSeconds);
        }
    } catch {
        // Silently handle Redis hiccups so presence tracking never breaks main app workflows
    }
}

/**
 * Clear user presence from Redis immediately (e.g. upon logout or session revocation).
 */
export async function clearUserPresence(
    redisClient: RedisPresenceClient,
    nik: string
): Promise<void> {
    if (!nik) return;
    try {
        await redisClient.del(getPresenceIndexKey(nik));
        if (typeof redisClient.scan === 'function') {
            let cursor = '0';
            const pattern = `${PRESENCE_PREFIX}${encodeURIComponent(nik)}:*`;
            const keysToDelete: string[] = [];
            do {
                const [nextCursor, batch] = await redisClient.scan(
                    cursor,
                    'MATCH',
                    pattern,
                    'COUNT',
                    100
                );
                cursor = nextCursor;
                if (Array.isArray(batch)) {
                    keysToDelete.push(...batch);
                }
            } while (cursor !== '0');

            if (keysToDelete.length > 0) {
                await redisClient.del(...keysToDelete);
            }
        }
    } catch {
        // Silently handle Redis errors
    }
}
