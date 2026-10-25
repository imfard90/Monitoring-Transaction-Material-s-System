/**
 * Lensa password decryption utility
 * Format: "iv:encryptedText" (AES-256-CBC)
 */

import crypto from 'node:crypto';

/**
 * Derive strict 32-byte encryption key from MFA_ENCRYPTION_SECRET using SHA-256.
 * P3-S6 compliant.
 */
function getEncryptionKey(): Buffer {
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('MFA_ENCRYPTION_SECRET is not set');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Decrypt Lensa password.
 * Tries SHA-256 derived key first, falls back to legacy slice(0,32) for backward compat.
 */
export function decryptLensaPassword(encryptedText: string): string {
    if (!encryptedText) return '';

    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) throw new Error('MFA_ENCRYPTION_SECRET is not set');

    try {
        const textParts = encryptedText.split(':');
        const shifted = textParts.shift();
        if (!shifted) throw new Error('Invalid encrypted text format');

        const iv = Buffer.from(shifted, 'hex');
        const encrypted = Buffer.from(textParts.join(':'), 'hex');

        // Primary: SHA-256 derived key (P3-S6)
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        } catch (_primaryErr) {
            // Fallback for legacy passwords encrypted with slice(0, 32)
            const keyLegacy = Buffer.from(secret.slice(0, 32));
            const decipher = crypto.createDecipheriv('aes-256-cbc', keyLegacy, iv);
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        }
    } catch (_e) {
        throw new Error('Failed to decrypt Lensa password');
    }
}
