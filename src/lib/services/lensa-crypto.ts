import crypto from 'node:crypto';

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
 * Decrypt Lensa password stored in database (AES-256-CBC) with legacy fallback.
 */
export function decryptLensaPassword(text: string): string {
    if (!text) return '';
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) throw new Error('MFA_ENCRYPTION_SECRET is not set');

    try {
        const textParts = text.split(':');
        const shifted = textParts.shift();
        if (!shifted) throw new Error('Invalid encrypted text format');
        const iv = Buffer.from(shifted, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');

        // Primary: strict SHA-256 derived key (P3-S6)
        try {
            const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
            let decrypted = decipher.update(encryptedText);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted.toString('utf8');
        } catch (_primaryErr) {
            // Fallback for legacy passwords encrypted with slice(0, 32)
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
