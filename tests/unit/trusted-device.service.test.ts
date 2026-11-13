import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/db';
import * as authAuditModule from '@/lib/security/auth-audit.service';
import {
    checkAndRegisterDevice,
    parseDeviceName,
    resetAllUserDevices,
    revokeUserDevice,
} from '@/lib/security/trusted-device.service';

vi.mock('@/lib/db/db', () => ({
    db: {
        selectFrom: vi.fn(),
        updateTable: vi.fn(),
        insertInto: vi.fn(),
    },
}));

vi.mock('@/lib/security/auth-audit.service', () => ({
    logAuthEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('trusted-device.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('parseDeviceName', () => {
        it('parses Chrome on macOS', () => {
            const ua =
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
            expect(parseDeviceName(ua)).toBe('Google Chrome (macOS)');
        });

        it('parses Safari on iOS', () => {
            const ua =
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
            expect(parseDeviceName(ua)).toBe('Apple Safari (iOS)');
        });

        it('parses Edge on Windows', () => {
            const ua =
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
            expect(parseDeviceName(ua)).toBe('Microsoft Edge (Windows 10/11)');
        });

        it('parses Firefox on Linux', () => {
            const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
            expect(parseDeviceName(ua)).toBe('Mozilla Firefox (Linux)');
        });

        it('returns fallback for null or empty string', () => {
            expect(parseDeviceName(null)).toBe('Perangkat Tidak Dikenal');
            expect(parseDeviceName('')).toBe('Perangkat Tidak Dikenal');
        });
    });

    describe('checkAndRegisterDevice', () => {
        it('allows existing active device and updates last_used_at', async () => {
            const mockExecute = vi.fn().mockResolvedValue([
                {
                    id: 'device-1',
                    device_fingerprint: 'fp-123',
                    is_revoked: false,
                    ip_address: '127.0.0.1',
                    user_agent: 'Chrome',
                },
            ]);

            const mockUpdateExecute = vi.fn().mockResolvedValue({ numUpdatedRows: 1n });

            vi.mocked(db.selectFrom).mockReturnValue({
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: mockExecute,
            } as any);

            vi.mocked(db.updateTable).mockReturnValue({
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: mockUpdateExecute,
            } as any);

            const result = await checkAndRegisterDevice({
                userId: 'user-1',
                deviceFingerprint: 'fp-123',
                ipAddress: '192.168.1.1',
                userAgent: 'Chrome',
            });

            expect(result.allowed).toBe(true);
            expect(result.isNew).toBe(false);
            expect(result.deviceId).toBe('device-1');
            expect(db.updateTable).toHaveBeenCalledWith('auth.user_trusted_devices');
        });

        it('registers new device when under 3-device limit', async () => {
            const mockExecute = vi.fn().mockResolvedValue([
                {
                    id: 'device-1',
                    device_fingerprint: 'fp-existing',
                    is_revoked: false,
                },
            ]);

            const mockInsertExecute = vi.fn().mockResolvedValue({ insertId: 'new-id' });

            vi.mocked(db.selectFrom).mockReturnValue({
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: mockExecute,
            } as any);

            vi.mocked(db.insertInto).mockReturnValue({
                values: vi.fn().mockReturnThis(),
                execute: mockInsertExecute,
            } as any);

            const result = await checkAndRegisterDevice({
                userId: 'user-1',
                deviceFingerprint: 'fp-new',
                ipAddress: '192.168.1.5',
                userAgent: 'Chrome on macOS',
            });

            expect(result.allowed).toBe(true);
            expect(result.isNew).toBe(true);
            expect(result.deviceCount).toBe(2);
            expect(db.insertInto).toHaveBeenCalledWith('auth.user_trusted_devices');
            expect(authAuditModule.logAuthEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'DEVICE_REGISTERED',
                    status: 'SUCCESS',
                })
            );
        });

        it('blocks registration when 3-device limit is reached and logs audit', async () => {
            const mockExecute = vi.fn().mockResolvedValue([
                { id: 'd-1', device_fingerprint: 'fp-1', is_revoked: false },
                { id: 'd-2', device_fingerprint: 'fp-2', is_revoked: false },
                { id: 'd-3', device_fingerprint: 'fp-3', is_revoked: false },
            ]);

            vi.mocked(db.selectFrom).mockReturnValue({
                selectAll: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                execute: mockExecute,
            } as any);

            const result = await checkAndRegisterDevice({
                userId: 'user-1',
                deviceFingerprint: 'fp-4th-device',
                ipAddress: '192.168.1.10',
                userAgent: 'Unknown Browser',
            });

            expect(result.allowed).toBe(false);
            expect(result.deviceCount).toBe(3);
            expect(result.reason).toContain('Batas maksimal 3 perangkat terdaftar telah tercapai');
            expect(authAuditModule.logAuthEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'LOGIN_BLOCKED_DEVICE_LIMIT',
                    status: 'BLOCKED',
                })
            );
            expect(db.insertInto).not.toHaveBeenCalled();
        });
    });

    describe('revokeUserDevice', () => {
        it('revokes device and logs audit', async () => {
            vi.mocked(db.updateTable).mockReturnValue({
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ numUpdatedRows: 1n }),
            } as any);

            const success = await revokeUserDevice('user-1', 'dev-1', 'ADM001');

            expect(success).toBe(true);
            expect(authAuditModule.logAuthEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'DEVICE_REVOKED',
                    status: 'SUCCESS',
                })
            );
        });
    });

    describe('resetAllUserDevices', () => {
        it('marks all active user devices as revoked', async () => {
            vi.mocked(db.updateTable).mockReturnValue({
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                executeTakeFirst: vi.fn().mockResolvedValue({ numUpdatedRows: 2n }),
            } as any);

            const count = await resetAllUserDevices('user-1', 'ADM001');
            expect(count).toBe(2);
        });
    });
});
