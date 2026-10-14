'use server';

import { headers } from 'next/headers';
import { securityLogger } from '@/lib/logger';
import { turnstileTokenSchema, verifyTurnstileToken } from '@/lib/security/turnstile';

/**
 * Server Action invoked by client forms to verify a Cloudflare
 * Turnstile token against the Siteverify API.
 *
 * Why a Server Action wrapper instead of calling the lib directly?
 *   - Client code cannot import server-only modules (DB, env, fetch
 *     with the secret key). The action is the legitimate boundary.
 *   - We resolve the visitor IP server-side from the standard proxy
 *     headers so the client never has to (or can) supply it.
 *   - We shape the response so client forms don't need to know
 *     about internal codes.
 *
 * AGENTS.md compliance:
 *   - §1.1 No fail-open: a missing secret returns `success: false`.
 *   - §2.7 Logging via `securityLogger` (token is never logged).
 *   - §2.15 Zod validation at the boundary.
 *   - §2.6 Action returns `{ success, error? }` shape via the
 *     `toActionResult` pattern's `ActionResult` envelope.
 */

export interface TurnstileActionResult {
    success: boolean;
    /** Human-friendly error message safe for UI display. */
    error?: string;
    /** Stable, machine-readable code for client analytics. */
    code?:
        | 'OK'
        | 'MISSING_SECRET'
        | 'INVALID_INPUT'
        | 'VALIDATION_TIMEOUT'
        | 'NETWORK_ERROR'
        | 'NON_OK_RESPONSE'
        | 'INVALID_RESPONSE_SHAPE'
        | 'INVALID_TOKEN'
        | 'ACTION_MISMATCH'
        | 'HOSTNAME_MISMATCH';
    /** Cloudflare's raw `error-codes` array, if any. */
    errorCodes?: string[];
}

const actionTokenSchema = turnstileTokenSchema;

/**
 * Extract the visitor IP from common proxy headers, falling back to
 * `unknown`. Order matches typical Cloudflare / Netlify / Next.js
 * deployments. We never trust a single header blindly in production
 * — the caller should sanitize upstream — but for rate-limiting and
 * Turnstile's optional `remoteip` parameter this is sufficient.
 */
function extractClientIp(headerBag: Record<string, string | string[] | undefined>): string | null {
    const candidates = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'true-client-ip'];
    for (const name of candidates) {
        const raw = headerBag[name];
        if (!raw) continue;
        const value = Array.isArray(raw) ? raw[0] : raw;
        if (!value) continue;
        // x-forwarded-for is a comma-separated list; take the first (client) entry.
        const first = value.split(',')[0]?.trim();
        if (first) return first;
    }
    return null;
}

/**
 * Verify a Turnstile token. Use from a client component via
 * `useTransition` or directly inside an existing form's submit
 * handler. The action does not throw — it always returns an
 * `ActionResult`-shaped object so the UI can render messages
 * consistently.
 */
export async function verifyTurnstileAction(token: string): Promise<TurnstileActionResult> {
    const parsed = actionTokenSchema.safeParse(token);
    if (!parsed.success) {
        securityLogger.warn('[TurnstileAction] Token rejected at boundary', {
            issues: parsed.error.issues.map((i) => i.message),
        });
        return {
            success: false,
            code: 'INVALID_INPUT',
            error: 'Verifikasi keamanan tidak valid. Silakan coba lagi.',
        };
    }

    let ip: string | null = null;
    try {
        const h = await headers();
        const bag: Record<string, string | string[] | undefined> = {};
        for (const [k, v] of h.entries()) bag[k.toLowerCase()] = v;
        ip = extractClientIp(bag);
    } catch {
        // `headers()` may not be available in every server-action context
        // (e.g. some test runners). Treat as unknown and proceed — IP is
        // optional to Siteverify anyway.
        ip = null;
    }

    const result = await verifyTurnstileToken(parsed.data, ip);

    if (result.success) {
        return { success: true, code: 'OK' };
    }

    return {
        success: false,
        code: result.code,
        errorCodes: result.errorCodes.length > 0 ? result.errorCodes : undefined,
        error: result.message,
    };
}
