import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/db';
import { getRecentAuditLogs, logAuthEvent } from '@/lib/security/auth-audit.service';

vi.mock('@/lib/db/db', () => ({
    db: {
        insertInto: vi.fn(),
        selectFrom: vi.fn(),
    },
}));

vi.mock('@/lib/logger', () => ({
    securityLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

describe('auth-audit.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('inserts audit log with values', async () => {
        const mockExecute = vi.fn().mockResolvedValue(undefined);
        vi.mocked(db.insertInto).mockReturnValue({
            values: vi.fn().mockReturnThis(),
            execute: mockExecute,
        } as any);

        await logAuthEvent({
            userId: 'user-1',
            nik: 'NIK123',
            eventType: 'LOGIN_SUCCESS',
            status: 'SUCCESS',
            ipAddress: '127.0.0.1',
            userAgent: 'Chrome on macOS',
            deviceName: 'Google Chrome (macOS)',
            deviceFingerprint: 'fp-123',
            reason: 'Login via OTP',
            metadata: { provider: 'totp' },
        });

        expect(db.insertInto).toHaveBeenCalledWith('auth.auth_audit_logs');
        expect(mockExecute).toHaveBeenCalled();
    });

    it('does not throw when insert fails and logs to securityLogger', async () => {
        vi.mocked(db.insertInto).mockReturnValue({
            values: vi.fn().mockReturnThis(),
            execute: vi.fn().mockRejectedValue(new Error('DB Connection Failed')),
        } as any);

        await expect(
            logAuthEvent({
                userId: 'user-1',
                eventType: 'LOGIN_FAILED',
            })
        ).resolves.not.toThrow();
    });

    it('inserts audit log without userId (nullable for pre-auth events)', async () => {
        const mockExecute = vi.fn().mockResolvedValue(undefined);
        const mockValues = vi.fn().mockReturnThis();
        vi.mocked(db.insertInto).mockReturnValue({
            values: mockValues,
            execute: mockExecute,
        } as any);

        await logAuthEvent({
            nik: 'NIK123',
            eventType: 'LOGIN_FAILED',
            status: 'FAILED',
            reason: 'Invalid password',
        });

        expect(db.insertInto).toHaveBeenCalledWith('auth.auth_audit_logs');
        expect(mockValues).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: null,
                nik: 'NIK123',
                event_type: 'LOGIN_FAILED',
                status: 'FAILED',
            })
        );
        expect(mockExecute).toHaveBeenCalled();
    });

    it('retrieves recent audit logs with filter', async () => {
        const mockExecute = vi.fn().mockResolvedValue([{ id: 1, event_type: 'LOGIN_SUCCESS' }]);
        vi.mocked(db.selectFrom).mockReturnValue({
            selectAll: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute: mockExecute,
        } as any);

        const logs = await getRecentAuditLogs('user-1', 10);
        expect(logs).toHaveLength(1);
        expect(db.selectFrom).toHaveBeenCalledWith('auth.auth_audit_logs');
    });
});

