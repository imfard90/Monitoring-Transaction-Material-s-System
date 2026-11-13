import { pool } from '@/lib/db/db';
import { errors } from '@/lib/errors';
import { securityLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { logAuthEvent } from './auth-audit.service';

export type OsFamily = 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS' | 'Unknown';
export type BrowserFamily = 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Automated' | 'Unknown';

export interface SessionBaseline {
    sessionId: string;
    userId: string;
    nik: string;
    initialIp: string;
    currentIp: string;
    country: string;
    browserFamily: BrowserFamily;
    osFamily: OsFamily;
    deviceFingerprint?: string;
    createdAt: number;
    lastSeenAt: number;
}

export interface NetworkContext {
    ipAddress: string;
    country: string;
    userAgent: string;
}

const BASELINE_KEY_PREFIX = 'auth:session-baseline:';
const BASELINE_TTL_SECONDS = 10 * 60 * 60; // 10 hours, aligned with session lifetime
const IMPOSSIBLE_TRAVEL_MAX_DELTA_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Extracts network and client context from incoming request headers.
 * Uses Cloudflare edge headers (cf-connecting-ip, cf-ipcountry) sanitized by Caddy reverse proxy.
 */
export function extractNetworkContext(headers: Headers): NetworkContext {
    const ipAddress =
        headers.get('cf-connecting-ip') ||
        headers.get('x-real-ip') ||
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        '127.0.0.1';

    const country = (headers.get('cf-ipcountry') || 'UNKNOWN').trim().toUpperCase();
    const userAgent = headers.get('user-agent') || 'Unknown';

    return { ipAddress, country, userAgent };
}

/**
 * Deterministic parser for User-Agent into high-level OS and Browser families.
 * Immune to minor browser version updates (e.g. Chrome 120 -> 121),
 * but detects cross-device or automated script jumps.
 */
export function parseUserAgentFamilies(ua: string): {
    osFamily: OsFamily;
    browserFamily: BrowserFamily;
} {
    const lower = ua.toLowerCase();

    // 1. Detect Automation / CLI tools / Scrapers
    if (
        lower.includes('curl/') ||
        lower.includes('python') ||
        lower.includes('postman') ||
        lower.includes('wget/') ||
        lower.includes('go-http-client') ||
        lower.includes('insomnia/') ||
        lower.includes('httpie/')
    ) {
        return { osFamily: 'Linux', browserFamily: 'Automated' };
    }

    // 2. Detect OS Family (Order matters: Mobile platforms checked before desktop)
    let osFamily: OsFamily = 'Unknown';
    if (lower.includes('android')) {
        osFamily = 'Android';
    } else if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ipod')) {
        osFamily = 'iOS';
    } else if (lower.includes('windows nt')) {
        osFamily = 'Windows';
    } else if (lower.includes('macintosh') || lower.includes('mac os x')) {
        osFamily = 'macOS';
    } else if (lower.includes('linux')) {
        osFamily = 'Linux';
    }

    // 3. Detect Browser Family (Order matters: Edge before Chrome, Chrome before Safari)
    let browserFamily: BrowserFamily = 'Unknown';
    if (lower.includes('edg/') || lower.includes('edge/')) {
        browserFamily = 'Edge';
    } else if (lower.includes('chrome/') || lower.includes('crios/')) {
        browserFamily = 'Chrome';
    } else if (lower.includes('firefox/') || lower.includes('fxios/')) {
        browserFamily = 'Firefox';
    } else if (lower.includes('safari/') && !lower.includes('chrome/')) {
        browserFamily = 'Safari';
    }

    return { osFamily, browserFamily };
}

/**
 * Stores session baseline in Redis upon initial sign-in / session creation.
 */
export async function recordSessionBaseline(
    sessionId: string,
    params: {
        userId: string;
        nik: string;
        headers: Headers;
        deviceFingerprint?: string;
    }
): Promise<void> {
    try {
        const net = extractNetworkContext(params.headers);
        const { osFamily, browserFamily } = parseUserAgentFamilies(net.userAgent);
        const now = Date.now();

        const baseline: SessionBaseline = {
            sessionId,
            userId: params.userId,
            nik: params.nik,
            initialIp: net.ipAddress,
            currentIp: net.ipAddress,
            country: net.country,
            browserFamily,
            osFamily,
            deviceFingerprint: params.deviceFingerprint,
            createdAt: now,
            lastSeenAt: now,
        };

        const key = `${BASELINE_KEY_PREFIX}${sessionId}`;
        await redis.set(key, JSON.stringify(baseline), 'EX', BASELINE_TTL_SECONDS);
    } catch (error) {
        securityLogger.warn(
            'Failed to record session baseline in Redis',
            error instanceof Error ? error : new Error(String(error)),
            { sessionId, userId: params.userId }
        );
    }
}

/**
 * Terminates session immediately across Redis and DB, records audit event,
 * and purges active session references.
 */
export async function killSessionAndAudit(
    sessionId: string,
    userId: string,
    nik: string,
    reason: string,
    metadata: Record<string, unknown>,
    net: NetworkContext,
    token?: string
): Promise<void> {
    try {
        // 1. Purge Redis session tokens and active session list
        if (token) {
            await redis.del(token);
        }
        await redis.del(`${BASELINE_KEY_PREFIX}${sessionId}`);
        await redis.del(`active-sessions-${userId}`);

        // 2. Delete session row in PostgreSQL
        await pool.query('DELETE FROM auth.session WHERE id = $1', [sessionId]);

        // 3. Record audit log
        await logAuthEvent({
            userId,
            nik,
            eventType:
                metadata.anomalyType === 'IMPOSSIBLE_TRAVEL'
                    ? 'SESSION_IMPOSSIBLE_TRAVEL'
                    : 'SESSION_HIJACK_DETECTED',
            status: 'BLOCKED',
            ipAddress: net.ipAddress,
            userAgent: net.userAgent,
            reason,
            metadata,
        });

        securityLogger.warn('Session terminated due to critical anomaly (hijack guard)', undefined, {
            sessionId,
            userId,
            nik,
            reason,
        });
    } catch (err) {
        securityLogger.error(
            'Error during session termination on anomaly',
            err instanceof Error ? err : new Error(String(err)),
            { sessionId, userId }
        );
    }
}

/**
 * Evaluates session integrity against baseline.
 * If critical anomaly is detected (OS jump, Browser Engine jump, or Impossible Travel),
 * it executes Instant Kill and throws AuthenticationError.
 */
export async function validateSessionIntegrity(
    session: {
        id: string;
        userId: string;
        token?: string;
        user?: { nik?: string };
    },
    headers: Headers
): Promise<{ allowed: boolean; reason?: string }> {
    const net = extractNetworkContext(headers);
    const { osFamily: incomingOs, browserFamily: incomingBrowser } = parseUserAgentFamilies(
        net.userAgent
    );

    const key = `${BASELINE_KEY_PREFIX}${session.id}`;
    let baselineRaw: string | null = null;

    try {
        baselineRaw = await redis.get(key);
    } catch (error) {
        // Fail-open for Redis connection errors so warehouse operations don't freeze
        securityLogger.warn(
            'Redis unavailable for session baseline check; failing open gracefully',
            error instanceof Error ? error : new Error(String(error)),
            { sessionId: session.id }
        );
        return { allowed: true };
    }

    const nik = session.user?.nik || '';

    // If no baseline found (e.g. baseline expired or created before this feature was deployed),
    // lazily initialize baseline from current request to establish fresh anchor
    if (!baselineRaw) {
        await recordSessionBaseline(session.id, {
            userId: session.userId,
            nik,
            headers,
        });
        return { allowed: true };
    }

    let baseline: SessionBaseline;
    try {
        baseline = JSON.parse(baselineRaw);
    } catch {
        return { allowed: true };
    }

    const now = Date.now();

    // ─── ANOMALY RULE 1: Automated Script / Tool Impersonation ────────
    if (incomingBrowser === 'Automated' && baseline.browserFamily !== 'Automated') {
        const reason = `Pembajakan sesi dicegah: Token sesi browser digunakan oleh skrip otomatis (${net.userAgent}).`;
        await killSessionAndAudit(
            session.id,
            session.userId,
            nik,
            reason,
            {
                anomalyType: 'AUTOMATED_TOOL',
                baseline: { os: baseline.osFamily, browser: baseline.browserFamily },
                incoming: { os: incomingOs, browser: incomingBrowser, userAgent: net.userAgent },
            },
            net,
            session.token
        );
        throw errors.auth('Sesi dihentikan demi keamanan karena terdeteksi anomali perangkat.');
    }

    // ─── ANOMALY RULE 2: Cross-OS Token Jump ─────────────────────────
    if (
        baseline.osFamily !== 'Unknown' &&
        incomingOs !== 'Unknown' &&
        baseline.osFamily !== incomingOs
    ) {
        const reason = `Pembajakan sesi dicegah: Token sesi berpindah sistem operasi dari ${baseline.osFamily} ke ${incomingOs}.`;
        await killSessionAndAudit(
            session.id,
            session.userId,
            nik,
            reason,
            {
                anomalyType: 'OS_MISMATCH',
                baseline: { os: baseline.osFamily, browser: baseline.browserFamily },
                incoming: { os: incomingOs, browser: incomingBrowser },
            },
            net,
            session.token
        );
        throw errors.auth('Sesi dihentikan demi keamanan karena terdeteksi anomali perangkat.');
    }

    // ─── ANOMALY RULE 3: Cross-Browser Engine Jump ───────────────────
    if (
        baseline.browserFamily !== 'Unknown' &&
        incomingBrowser !== 'Unknown' &&
        baseline.browserFamily !== incomingBrowser
    ) {
        const reason = `Pembajakan sesi dicegah: Token sesi berpindah peramban dari ${baseline.browserFamily} ke ${incomingBrowser}.`;
        await killSessionAndAudit(
            session.id,
            session.userId,
            nik,
            reason,
            {
                anomalyType: 'BROWSER_MISMATCH',
                baseline: { os: baseline.osFamily, browser: baseline.browserFamily },
                incoming: { os: incomingOs, browser: incomingBrowser },
            },
            net,
            session.token
        );
        throw errors.auth('Sesi dihentikan demi keamanan karena terdeteksi anomali perangkat.');
    }

    // ─── ANOMALY RULE 4: Impossible Geolocation Travel ───────────────
    if (
        baseline.country !== 'UNKNOWN' &&
        net.country !== 'UNKNOWN' &&
        baseline.country !== net.country
    ) {
        const timeDelta = now - (baseline.lastSeenAt || baseline.createdAt);
        if (timeDelta < IMPOSSIBLE_TRAVEL_MAX_DELTA_MS) {
            const reason = `Perjalanan mustahil dicegah: Akses berpindah dari negara ${baseline.country} ke ${net.country} dalam waktu ${Math.round(timeDelta / 60000)} menit.`;
            await killSessionAndAudit(
                session.id,
                session.userId,
                nik,
                reason,
                {
                    anomalyType: 'IMPOSSIBLE_TRAVEL',
                    baseline: { country: baseline.country, ip: baseline.currentIp },
                    incoming: { country: net.country, ip: net.ipAddress },
                    timeDeltaMinutes: Math.round(timeDelta / 60000),
                },
                net,
                session.token
            );
            throw errors.auth(
                'Sesi dihentikan demi keamanan karena terdeteksi perpindahan lokasi geografis yang mencurigakan.'
            );
        }
    }

    // ─── NORMAL: Mobile IP Hopping or Regular Request ─────────────────
    // If IP changed within the same country / OS / Browser, update currentIp and lastSeenAt asynchronously
    if (baseline.currentIp !== net.ipAddress || now - baseline.lastSeenAt > 60000) {
        baseline.currentIp = net.ipAddress;
        baseline.lastSeenAt = now;
        try {
            await redis.set(key, JSON.stringify(baseline), 'EX', BASELINE_TTL_SECONDS);
        } catch {
            // Non-blocking
        }
    }

    return { allowed: true };
}

