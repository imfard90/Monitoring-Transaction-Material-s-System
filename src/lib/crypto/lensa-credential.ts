import crypto from 'node:crypto';

/**
 * AES-256-GCM helpers for the Lensa portal credentials stored in `auth.user.lensa_acount`.
 *
 * AGENTS.md §3.2 requires AES-256-GCM (authenticated encryption) — the previous
 * AES-256-CBC implementation had no integrity tag, so a tampered ciphertext
 * decrypted silently to garbage.
 *
 * Stored payload format: `<iv-hex>:<authTag-hex>:<ciphertext-hex>`.
 *
 * ponytail: legacy CBC payloads are still readable via `decryptLensaPassword`
 * in `@/lib/services/lensa-crypto` (which keeps its own fallback chain). This
 * module only handles the new GCM format — drop it once all accounts are
 * re-saved from the User Profile page.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a strict 32-byte key from `MFA_ENCRYPTION_SECRET` using SHA-256.
 *
 * Never `slice(0, 32)` — that pads/truncates low-entropy secrets.
 */
export function getLensaEncryptionKey(): Buffer {
    const secret = process.env.MFA_ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('MFA_ENCRYPTION_SECRET is not set');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a Lensa password with AES-256-GCM.
 */
export function encryptLensaPassword(plaintext: string): string {
    if (!plaintext) {
        throw new Error('Password cannot be empty');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getLensaEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a Lensa password stored in the GCM format.
 *
 * Throws when the payload is malformed or the auth tag does not match.
 */
export function decryptLensaPasswordGcm(payload: string): string {
    if (!payload) {
        throw new Error('Failed to decrypt password');
    }
    const parts = payload.split(':');
    if (parts.length !== 3) {
        throw new Error('Failed to decrypt password');
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    if (!ivHex || !authTagHex || !ciphertextHex) {
        throw new Error('Failed to decrypt password');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error('Failed to decrypt password');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getLensaEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, 'hex')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}
