import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { encryptLensaPassword } from '@/lib/crypto/lensa-credential';
import { decryptLensaPassword } from '@/lib/services/lensa-crypto';

describe('Lensa Password Decryption (Unified GCM + CBC)', () => {
    const TEST_SECRET = 'super-secret-mfa-encryption-key-32-bytes!';

    beforeEach(() => {
        process.env.MFA_ENCRYPTION_SECRET = TEST_SECRET;
    });

    it('decrypts modern AES-256-GCM encrypted passwords (3 parts)', () => {
        const rawPassword = 'PasswordGcm123!';
        const encrypted = encryptLensaPassword(rawPassword);
        expect(encrypted.split(':')).toHaveLength(3);

        const decrypted = decryptLensaPassword(encrypted);
        expect(decrypted).toBe(rawPassword);
    });

    it('decrypts legacy AES-256-CBC encrypted passwords with SHA-256 derived key (2 parts)', () => {
        const rawPassword = 'LegacyShaPassword456!';
        const key = crypto.createHash('sha256').update(TEST_SECRET).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const encrypted = Buffer.concat([cipher.update(rawPassword, 'utf8'), cipher.final()]);
        const payload = `${iv.toString('hex')}:${encrypted.toString('hex')}`;
        expect(payload.split(':')).toHaveLength(2);

        const decrypted = decryptLensaPassword(payload);
        expect(decrypted).toBe(rawPassword);
    });

    it('decrypts legacy AES-256-CBC encrypted passwords with slice(0, 32) key (2 parts)', () => {
        const rawPassword = 'LegacySlicePassword789!';
        const keyLegacy = Buffer.from(TEST_SECRET.slice(0, 32));
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', keyLegacy, iv);
        const encrypted = Buffer.concat([cipher.update(rawPassword, 'utf8'), cipher.final()]);
        const payload = `${iv.toString('hex')}:${encrypted.toString('hex')}`;
        expect(payload.split(':')).toHaveLength(2);

        const decrypted = decryptLensaPassword(payload);
        expect(decrypted).toBe(rawPassword);
    });

    it('returns empty string when given empty input', () => {
        expect(decryptLensaPassword('')).toBe('');
    });

    it('throws error when ciphertext is invalid or tampered', () => {
        expect(() => decryptLensaPassword('invalid:garbage:payload')).toThrow();
    });
});

