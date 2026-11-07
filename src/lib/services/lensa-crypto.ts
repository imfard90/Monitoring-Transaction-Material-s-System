import crypto from 'node:crypto';
import { decryptLensaPasswordGcm } from '@/lib/crypto/lensa-credential';

/**
 * P3-S6: Derive strict 32-byte key from MFA_ENCRYPTION_SECRET using SHA-256.
 */
export function getEncryptionKey(): Buffer {
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('MFA_ENCRYPTION_SECRET is not set');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Decrypt Lensa password stored in database.
 * Supports:
 * 1. AES-256-GCM (current standard: `<iv-hex>:<authTag-hex>:<ciphertext-hex>`)
 * 2. AES-256-CBC with strict SHA-256 key (legacy: `<iv-hex>:<ciphertext-hex>`)
 * 3. AES-256-CBC with legacy slice(0, 32) key (backward compatibility)
 */
export function decryptLensaPassword(text: string): string {
    if (!text) return '';
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) throw new Error('MFA_ENCRYPTION_SECRET is not set');

    const parts = text.split(':');

    // 1. Primary: AES-256-GCM (3 parts: iv:authTag:ciphertext)
    if (parts.length === 3) {
        try {
            return decryptLensaPasswordGcm(text);
        } catch {
            // Fall through to CBC if GCM fails
        }
    }

    try {
        const shifted = parts[0];
        if (!shifted) throw new Error('Invalid encrypted text format');
        const iv = Buffer.from(shifted, 'hex');
        const encryptedText = Buffer.from(parts.slice(1).join(':'), 'hex');

        // 2. Primary CBC: strict SHA-256 derived key (P3-S6)
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        } catch (_primaryErr) {
            // 3. Fallback for legacy passwords encrypted with slice(0, 32)
            const keyLegacy = Buffer.from(secret.slice(0, 32));
            const decipher = crypto.createDecipheriv('aes-256-cbc', keyLegacy, iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        }
    } catch (_e) {
        throw new Error('Failed to decrypt password');
    }
}

/**
 * Concurrency limiter pool for asynchronous operations.
 */
export async function asyncPool<T, R>(
    poolLimit: number,
    array: T[],
    iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
    const ret: Promise<R>[] = [];
    const executing: Promise<void>[] = [];
    for (const item of array) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);

        if (poolLimit <= array.length) {
            const e: Promise<void> = p.then(() => {
                executing.splice(executing.indexOf(e), 1);
            });
            executing.push(e);
            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(ret);
}
