import crypto from 'node:crypto';

export const API_KEY_PREFIX = 'mtms_live_';

/**
 * Generates a cryptographically secure MTMS live API key and its SHA-256 hash.
 * Format: mtms_live_<64-character-hex-string>
 */
export function generateApiKey(): { rawKey: string; hashedKey: string } {
    const secret = crypto.randomBytes(32).toString('hex');
    const rawKey = `${API_KEY_PREFIX}${secret}`;
    const hashedKey = hashApiKey(rawKey);
    return { rawKey, hashedKey };
}

/**
 * Computes SHA-256 digest hex of an API key for safe storage and constant lookup.
 */
export function hashApiKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Validates format of MTMS live API key before attempting lookup.
 */
export function isValidApiKeyFormat(key: unknown): key is string {
    if (typeof key !== 'string') return false;
    if (!key.startsWith(API_KEY_PREFIX)) return false;
    return key.length >= 20;
}

/**
 * Returns a masked representation of an API key for UI display.
 */
export function maskApiKey(): string {
    return `${API_KEY_PREFIX}${'•'.repeat(32)}`;
}
