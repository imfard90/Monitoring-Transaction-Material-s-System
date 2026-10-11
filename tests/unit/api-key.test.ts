import { describe, expect, it } from 'vitest';
import {
    API_KEY_PREFIX,
    generateApiKey,
    hashApiKey,
    isValidApiKeyFormat,
    maskApiKey,
} from '@/lib/security/api-key';

describe('API Key Security Utilities', () => {
    it('generates a valid API key with correct prefix and hex entropy', () => {
        const { rawKey, hashedKey } = generateApiKey();

        expect(rawKey.startsWith(API_KEY_PREFIX)).toBe(true);
        expect(rawKey.length).toBe(API_KEY_PREFIX.length + 64);
        expect(hashedKey).toHaveLength(64); // SHA-256 hex string is 64 chars
        expect(hashedKey).toBe(hashApiKey(rawKey));
    });

    it('produces deterministic SHA-256 hashes', () => {
        const testKey = 'mtms_live_0123456789abcdef0123456789abcdef01234567';
        const hash1 = hashApiKey(testKey);
        const hash2 = hashApiKey(testKey);

        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('validates API key format correctly', () => {
        expect(isValidApiKeyFormat('mtms_live_abcdef1234567890abcdef')).toBe(true);
        expect(isValidApiKeyFormat('mtms_live_short')).toBe(false);
        expect(isValidApiKeyFormat('invalid_prefix_1234567890abcdef')).toBe(false);
        expect(isValidApiKeyFormat('')).toBe(false);
        expect(isValidApiKeyFormat(null)).toBe(false);
        expect(isValidApiKeyFormat(undefined)).toBe(false);
        expect(isValidApiKeyFormat(12345)).toBe(false);
    });

    it('masks API key safely for UI presentation', () => {
        const masked = maskApiKey();
        expect(masked.startsWith(API_KEY_PREFIX)).toBe(true);
        expect(masked).toContain('••••');
        expect(masked).not.toContain('undefined');
    });
});
