import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
    headers: vi.fn().mockResolvedValue(new Headers({ 'user-agent': 'Chrome/120', 'x-forwarded-for': '127.0.0.1' })),
}));

const mockGetSession = vi.fn();
const mockVerifyTOTP = vi.fn();

vi.mock('@/lib/auth', () => ({
    auth: {
        api: {
            getSession: () => mockGetSession(),
            verifyTOTP: (args: unknown) => mockVerifyTOTP(args),
        },
    },
}));

vi.mock('@/lib/db/db', () => ({
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

const mockRedisSet = vi.fn().mockResolvedValue('OK');
const mockRedisDel = vi.fn().mockResolvedValue(1);

vi.mock('@/lib/redis', () => ({
    redis: {
        set: (...args: unknown[]) => mockRedisSet(...args),
        del: (...args: unknown[]) => mockRedisDel(...args),
    },
}));

vi.mock('@/lib/logger', () => ({
    actionLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    securityLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockCheckAndRegisterDevice = vi.fn();
const mockListUserDevices = vi.fn();

vi.mock('@/lib/security/trusted-device.service', () => ({
    checkAndRegisterDevice: (...args: unknown[]) => mockCheckAndRegisterDevice(...args),
    listUserDevices: (...args: unknown[]) => mockListUserDevices(...args),
    MAX_TRUSTED_DEVICES_PER_USER: 3,
}));

vi.mock('@/lib/security/auth-audit.service', () => ({
    logAuthEvent: vi.fn().mockResolvedValue(undefined),
}));

const { checkDeviceAction, verifyTotpForSensitiveAction, getUserMfaStatusAction } = await import(
    '@/lib/security/mfa-actions'
);

describe('mfa-actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkDeviceAction', () => {
        it('rejects invalid fingerprint parameter (less than 8 chars)', async () => {
            const res = await checkDeviceAction({ deviceFingerprint: 'short' });
            expect(res.success).toBe(false);
            expect(res.error).toContain('Parameter perangkat tidak valid');
        });

        it('returns error if session is invalid', async () => {
            mockGetSession.mockResolvedValueOnce(null);
            const res = await checkDeviceAction({ deviceFingerprint: 'valid-fingerprint-12345' });
            expect(res.success).toBe(false);
            expect(res.error).toContain('Sesi login tidak valid');
        });

        it('handles device limit blocked by clearing sessions and returning blocked status', async () => {
            mockGetSession.mockResolvedValueOnce({
                user: { id: 'user-1', nik: 'NIK123' },
                session: { token: 'session-token' },
            });
            mockCheckAndRegisterDevice.mockResolvedValueOnce({
                allowed: false,
                reason: 'Batas maksimal 3 perangkat terdaftar tercapai.',
                deviceCount: 3,
            });

            const res = await checkDeviceAction({ deviceFingerprint: 'valid-fingerprint-12345' });
            expect(res.success).toBe(false);
            expect(res.blocked).toBe(true);
            expect(mockRedisDel).toHaveBeenCalledWith('session-token');
        });

        it('registers device successfully when allowed', async () => {
            mockGetSession.mockResolvedValueOnce({
                user: { id: 'user-1', nik: 'NIK123' },
                session: { token: 'session-token' },
            });
            mockCheckAndRegisterDevice.mockResolvedValueOnce({
                allowed: true,
                deviceId: 'dev-1',
                isNew: true,
                deviceCount: 1,
            });

            const res = await checkDeviceAction({ deviceFingerprint: 'valid-fingerprint-12345' });
            expect(res.success).toBe(true);
            expect(res.deviceId).toBe('dev-1');
        });
    });

    describe('verifyTotpForSensitiveAction', () => {
        it('rejects OTP code that is not 6 digits', async () => {
            const res = await verifyTotpForSensitiveAction('12345', 'cancel-tag:101');
            expect(res.success).toBe(false);
            expect(res.error).toContain('6 digit');
        });

        it('verifies TOTP and sets grant key on success', async () => {
            mockGetSession.mockResolvedValueOnce({
                user: { id: 'user-1', nik: 'NIK123' },
            });
            mockVerifyTOTP.mockResolvedValueOnce({ status: true });

            const res = await verifyTotpForSensitiveAction('123456', 'cancel-tag:101');
            expect(res.success).toBe(true);
            expect(mockRedisSet).toHaveBeenCalledWith(
                'mfa:grant:NIK123:cancel-tag:101',
                '1',
                'EX',
                120
            );
        });

        it('returns error when TOTP verification fails', async () => {
            mockGetSession.mockResolvedValueOnce({
                user: { id: 'user-1', nik: 'NIK123' },
            });
            mockVerifyTOTP.mockRejectedValueOnce(new Error('Invalid code'));

            const res = await verifyTotpForSensitiveAction('999999', 'cancel-tag:101');
            expect(res.success).toBe(false);
            expect(res.error).toContain('Kode OTP tidak valid');
        });
    });

    describe('getUserMfaStatusAction', () => {
        it('returns status from session and devices', async () => {
            mockGetSession.mockResolvedValueOnce({
                user: { id: 'user-1', twoFactorEnabled: true },
            });
            mockListUserDevices.mockResolvedValueOnce([
                { id: '1', is_revoked: false },
                { id: '2', is_revoked: true },
            ]);

            const res = await getUserMfaStatusAction();
            expect(res.twoFactorEnabled).toBe(true);
            expect(res.activeDevicesCount).toBe(1);
            expect(res.maxDevices).toBe(3);
        });
    });
});
