/**
 * Idempotency Client-Side Module for MTMS
 * Provides client-safe functions that don't require Redis
 *
 * Usage:
 * - Inventory Tx: Generate and store idempotency key in client before submitting to Server Action
 */

// We use native web crypto API to make it edge/client compatible
function getCryptoRandomString(length: number): string {
    if (typeof window !== 'undefined' && window.crypto) {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for non-browser env
    return (
        Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
}

// ============================================
// Types
// ============================================

export interface IdempotencyConfig {
    prefix: string;
    ttl: number; // dalam detik
}

// ============================================
// Client-Side Functions (No Redis needed)
// ============================================

// Default configurations
export const IDEMPOTENCY_CONFIGS: Record<string, IdempotencyConfig> = {
    inventoryTx: {
        prefix: 'idemp_inv',
        ttl: 300, // 5 menit
    },
    login: {
        prefix: 'idemp_login',
        ttl: 300, // 5 menit
    },
};

/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey(): string {
    return `ikey_${Date.now()}_${getCryptoRandomString(16)}`;
}

// Default prefix for client-side storage
const DEFAULT_PREFIX = 'idemp';

/**
 * Get idempotency key from cookie (client-side)
 * Uses default prefix - for custom prefix use the typed version
 */
export function getIdempotencyKey(): string | null {
    if (typeof window === 'undefined') return null;

    const cookies = document.cookie.split(';').reduce(
        (acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            if (key && value) acc[key] = value;
            return acc;
        },
        {} as Record<string, string>
    );

    return cookies[`${DEFAULT_PREFIX}_key`] || null;
}

/**
 * Set idempotency key in cookie (for server to read)
 * Uses default config
 */
export function setIdempotencyKey(
    key: string,
    type: keyof typeof IDEMPOTENCY_CONFIGS = 'inventoryTx'
): void {
    if (typeof window === 'undefined') return;
    const config = IDEMPOTENCY_CONFIGS[type];
    // biome-ignore lint/suspicious/noDocumentCookie: native cookie management fallback
    document.cookie = `${config.prefix}_key=${key}; path=/; max-age=${config.ttl}; SameSite=Lax`;
}

/**
 * Remove idempotency key from cookie
 */
export function removeIdempotencyKey(
    keyType: keyof typeof IDEMPOTENCY_CONFIGS = 'inventoryTx'
): void {
    if (typeof window === 'undefined') return;
    const config = IDEMPOTENCY_CONFIGS[keyType];
    // biome-ignore lint/suspicious/noDocumentCookie: native cookie management fallback
    document.cookie = `${config.prefix}_key=; path=/; max-age=0`;
}

export { removeIdempotencyKey as clearIdempotencyKey };
