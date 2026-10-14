/**
 * Cloudflare Turnstile server-side validation.
 *
 * Wraps the Siteverify API documented at:
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * Endpoint: POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 * Request body (form-encoded or JSON):
 *   - secret    (required) widget secret key
 *   - response  (required) token from the client widget
 *   - remoteip  (optional) visitor IP
 * Response JSON:
 *   - { success: true,  challenge_ts, hostname, action, cdata, metadata }
 *   - { success: false, "error-codes": [...], ... }
 *
 * Token characteristics (per Cloudflare docs):
 *   - Max 2048 characters
 *   - Valid for 300 seconds (5 minutes) after generation
 *   - Single-use; reuse returns "timeout-or-duplicate"
 *
 * MTMS-specific rules enforced here:
 *   - AGENTS.md §1.1  Never fail-open: a missing secret returns failure,
 *     not a permissive success.
 *   - AGENTS.md §2.7  Use `securityLogger`; never `console.*`.
 *   - AGENTS.md §2.15 Zod-validate the token at the boundary.
 */

import { z } from 'zod';
import { securityLogger } from '@/lib/logger';

/**
 * The Cloudflare Siteverify endpoint. Do not change without confirming
 * upstream compatibility — this is the only canonical verification URL.
 */
export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Maximum token length per Cloudflare docs. We bound it tighter than
 * 2048 to catch obvious abuse before paying the upstream round-trip.
 */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

/**
 * Default timeout for the Siteverify HTTP call. Cloudflare normally
 * responds in <2s; 5s gives generous headroom without holding up a
 * form submission indefinitely.
 */
export const TURNSTILE_VERIFY_TIMEOUT_MS = 5000;

/**
 * Zod schema for a token submitted by the client. Single string,
 * length-bounded per Cloudflare's documented maximum. Empty strings
 * and whitespace-only values are not accepted.
 */
export const turnstileTokenSchema = z
    .string()
    .trim()
    .min(1, 'Token Turnstile kosong')
    .max(
        TURNSTILE_TOKEN_MAX_LENGTH,
        `Token Turnstile melebihi ${TURNSTILE_TOKEN_MAX_LENGTH} karakter`
    );

export type TurnstileToken = z.infer<typeof turnstileTokenSchema>;

/**
 * Response from the Cloudflare Siteverify API.
 * See: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export interface TurnstileSiteverifyResponse {
    success: boolean;
    /** ISO 8601 timestamp of when the challenge was solved. */
    challenge_ts?: string;
    /** Hostname the widget was served from. */
    hostname?: string;
    /** Action string passed to the widget (if any). */
    action?: string;
    /** Custom data passed to the widget (if any). */
    cdata?: string;
    /** Optional metadata about the rendered widget. */
    metadata?: {
        interactive?: boolean;
    };
    /** Populated only on failure. */
    'error-codes'?: string[];
}

/**
 * Stable, machine-readable codes returned by `verifyTurnstileToken`.
 * Use these instead of inspecting raw error-codes so callers don't
 * depend on Cloudflare's exact strings.
 */
export type TurnstileVerificationCode =
    | 'MISSING_SECRET' // Server not configured — fail-closed
    | 'INVALID_INPUT' // Local zod validation rejected the token
    | 'VALIDATION_TIMEOUT' // Siteverify did not respond in time
    | 'NETWORK_ERROR' // Underlying fetch failed
    | 'NON_OK_RESPONSE' // Siteverify returned non-2xx
    | 'INVALID_RESPONSE_SHAPE' // Siteverify returned unparseable JSON
    | 'INVALID_TOKEN' // success=false from Cloudflare
    | 'ACTION_MISMATCH' // optional expectedAction did not match
    | 'HOSTNAME_MISMATCH' // optional expectedHostname did not match
    | 'OK'; // success=true and (optional) action/hostname matched

export interface TurnstileVerificationResult {
    success: boolean;
    code: TurnstileVerificationCode;
    /** Cloudflare's raw `error-codes` array, if any. */
    errorCodes: string[];
    /** Human-friendly message safe for UI display (Bahasa Indonesia). */
    message: string;
    /** Echo back the validated token (truncated to 8 chars) for logging. */
    tokenFingerprint?: string;
    /** hostname returned by Cloudflare, when present. */
    hostname?: string;
    /** action returned by Cloudflare, when present. */
    action?: string;
}

/**
 * Options for verification. `expectedAction` and `expectedHostname`
 * mirror the advanced-validation examples in Cloudflare's docs:
 * checking these in your own backend prevents token reuse across
 * forms or across hostnames.
 */
export interface VerifyTurnstileOptions {
    /** Action the widget was configured with (e.g. 'login'). */
    expectedAction?: string;
    /** Hostname Cloudflare should report (e.g. 'app.example.com'). */
    expectedHostname?: string;
    /** Override the default HTTP timeout (ms). */
    timeoutMs?: number;
    /** AbortSignal to cancel the verification (e.g. on user navigation). */
    signal?: AbortSignal;
}

/**
 * Build a stable fingerprint for log entries without exposing the
 * raw token. The first 8 hex chars of SHA-256 are more than enough
 * to correlate repeated submissions of the same token in logs.
 */
async function fingerprintToken(token: string): Promise<string> {
    try {
        const { createHash } = await import('node:crypto');
        return createHash('sha256').update(token).digest('hex').slice(0, 8);
    } catch {
        return token.slice(0, 4);
    }
}

/**
 * Resolve the Turnstile secret from the environment. Returns null
 * if the secret is missing or empty. We intentionally do NOT fall
 * back to a default value — the caller must treat null as a
 * fail-closed condition (AGENTS.md §1.1: never fail-open).
 */
function resolveSecret(): string | null {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return null;
    const trimmed = secret.trim();
    if (trimmed.length === 0) return null;
    return trimmed;
}

/**
 * Verify a Turnstile token with Cloudflare's Siteverify API.
 *
 * This is the canonical verification entry point for server code in
 * MTMS. All server actions / route handlers that accept a Turnstile
 * token from the client must funnel through here so that:
 *   - Input shape is validated (zod)
 *   - Missing-secret configuration fails closed
 *   - Network and parse failures are surfaced with stable codes
 *   - Logs are written via `securityLogger` (never `console.*`)
 *
 * @example
 *   const result = await verifyTurnstileToken(token, request.headers.get('cf-connecting-ip'));
 *   if (!result.success) return { error: result.message };
 */
export async function verifyTurnstileToken(
    token: string,
    remoteIp?: string | null,
    options: VerifyTurnstileOptions = {}
): Promise<TurnstileVerificationResult> {
    const fp = await fingerprintToken(token);

    // 1. Local input validation — never trust client shape.
    const parsed = turnstileTokenSchema.safeParse(token);
    if (!parsed.success) {
        securityLogger.warn('[Turnstile] Token rejected by local validation', {
            fingerprint: fp,
            issues: parsed.error.issues.map((i) => i.message),
        });
        return {
            success: false,
            code: 'INVALID_INPUT',
            errorCodes: [],
            message: 'Verifikasi keamanan tidak valid. Silakan coba lagi.',
            tokenFingerprint: fp,
        };
    }

    // 2. Configuration guard — missing secret must fail closed.
    const secret = resolveSecret();
    if (!secret) {
        securityLogger.error(
            '[Turnstile] TURNSTILE_SECRET_KEY is not configured; failing closed',
            new Error(`Turnstile configuration missing (fingerprint: ${fp})`)
        );
        return {
            success: false,
            code: 'MISSING_SECRET',
            errorCodes: ['missing-input-secret'],
            message: 'Verifikasi keamanan belum dikonfigurasi di server. Hubungi administrator.',
            tokenFingerprint: fp,
        };
    }

    // 3. Siteverify call with timeout + optional caller-provided signal.
    const timeoutMs = options.timeoutMs ?? TURNSTILE_VERIFY_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
        // Chain caller signal so manual cancellation also aborts.
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', parsed.data);
    if (remoteIp) body.set('remoteip', remoteIp);

    let response: Response;
    try {
        response = await fetch(TURNSTILE_SITEVERIFY_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: controller.signal,
            // Do not cache; every token is single-use.
            cache: 'no-store',
        });
    } catch (error) {
        clearTimeout(timeoutId);
        const isAbort =
            (error instanceof Error && error.name === 'AbortError') || controller.signal.aborted;
        securityLogger.warn(
            isAbort
                ? '[Turnstile] Siteverify request aborted/timeout'
                : '[Turnstile] Siteverify network error',
            {
                fingerprint: fp,
                isAbort,
                error: error instanceof Error ? error.message : String(error),
            }
        );
        return {
            success: false,
            code: isAbort ? 'VALIDATION_TIMEOUT' : 'NETWORK_ERROR',
            errorCodes: [],
            message: 'Layanan verifikasi keamanan tidak merespons. Silakan coba lagi.',
            tokenFingerprint: fp,
        };
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
        securityLogger.warn('[Turnstile] Siteverify returned non-2xx', {
            fingerprint: fp,
            status: response.status,
        });
        return {
            success: false,
            code: 'NON_OK_RESPONSE',
            errorCodes: [],
            message: 'Verifikasi keamanan gagal. Silakan coba lagi.',
            tokenFingerprint: fp,
        };
    }

    let payload: TurnstileSiteverifyResponse;
    try {
        payload = (await response.json()) as TurnstileSiteverifyResponse;
    } catch (error) {
        securityLogger.warn('[Turnstile] Siteverify returned unparseable JSON', {
            fingerprint: fp,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            success: false,
            code: 'INVALID_RESPONSE_SHAPE',
            errorCodes: [],
            message: 'Verifikasi keamanan gagal. Silakan coba lagi.',
            tokenFingerprint: fp,
        };
    }

    // 4. Honor Cloudflare's verdict.
    if (!payload.success) {
        const errorCodes = payload['error-codes'] ?? [];
        securityLogger.warn('[Turnstile] Token rejected by Cloudflare', {
            fingerprint: fp,
            errorCodes,
            hostname: payload.hostname,
            action: payload.action,
        });
        return {
            success: false,
            code: 'INVALID_TOKEN',
            errorCodes,
            message: 'Verifikasi keamanan gagal. Silakan coba lagi.',
            tokenFingerprint: fp,
            hostname: payload.hostname,
            action: payload.action,
        };
    }

    // 5. Optional action/hostname pinning (advanced validation).
    if (options.expectedAction && payload.action !== options.expectedAction) {
        securityLogger.warn('[Turnstile] Action mismatch', {
            fingerprint: fp,
            expected: options.expectedAction,
            received: payload.action,
        });
        return {
            success: false,
            code: 'ACTION_MISMATCH',
            errorCodes: [],
            message: 'Verifikasi keamanan gagal. Silakan coba lagi.',
            tokenFingerprint: fp,
            action: payload.action,
            hostname: payload.hostname,
        };
    }
    if (options.expectedHostname && payload.hostname !== options.expectedHostname) {
        securityLogger.warn('[Turnstile] Hostname mismatch', {
            fingerprint: fp,
            expected: options.expectedHostname,
            received: payload.hostname,
        });
        return {
            success: false,
            code: 'HOSTNAME_MISMATCH',
            errorCodes: [],
            message: 'Verifikasi keamanan gagal. Silakan coba lagi.',
            tokenFingerprint: fp,
            hostname: payload.hostname,
            action: payload.action,
        };
    }

    securityLogger.info('[Turnstile] Token verified', {
        fingerprint: fp,
        hostname: payload.hostname,
        action: payload.action,
    });

    return {
        success: true,
        code: 'OK',
        errorCodes: [],
        message: 'Verifikasi keamanan berhasil.',
        tokenFingerprint: fp,
        hostname: payload.hostname,
        action: payload.action,
    };
}
