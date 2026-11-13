import { db } from '@/lib/db/db';
import { securityLogger } from '@/lib/logger';

export type AuthEventType =
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'LOGIN_BLOCKED_INACTIVE'
    | 'LOGIN_BLOCKED_DEVICE_LIMIT'
    | 'LOGOUT_MANUAL'
    | 'LOGOUT_TIMEOUT'
    | 'LOGOUT_FORCE_KICK'
    | 'MFA_SETUP'
    | 'MFA_VERIFY_SUCCESS'
    | 'MFA_VERIFY_FAILED'
    | 'MFA_RESET_BY_ADMIN'
    | 'DEVICE_REGISTERED'
    | 'DEVICE_REVOKED'
    | 'SESSION_HIJACK_DETECTED'
    | 'SESSION_IMPOSSIBLE_TRAVEL'
    | 'SESSION_ANOMALY_FLAGGED'
    | 'PASSWORD_RESET_REQUESTED'
    | 'PASSWORD_RESET_COMPLETED';

export type AuthEventStatus = 'SUCCESS' | 'FAILED' | 'BLOCKED';

export interface LogAuthEventParams {
    userId?: string | null;
    nik?: string | null;
    eventType: AuthEventType | string;
    status?: AuthEventStatus;
    ipAddress?: string | null;
    userAgent?: string | null;
    deviceName?: string | null;
    deviceFingerprint?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
}

/**
 * Service to record authentication audit logs to `auth.auth_audit_logs`.
 * This provides immutable compliance trails for logins, logouts, concurrent kickouts,
 * device limits, and MFA verifications.
 */
export async function logAuthEvent(params: LogAuthEventParams): Promise<void> {
    try {
        await db
            .insertInto('auth.auth_audit_logs')
            .values({
                user_id: params.userId ?? null,
                nik: params.nik ?? null,
                event_type: params.eventType,
                status: params.status ?? 'SUCCESS',
                ip_address: params.ipAddress ?? null,
                user_agent: params.userAgent ?? null,
                device_name: params.deviceName ?? null,
                device_fingerprint: params.deviceFingerprint ?? null,
                reason: params.reason ?? null,
                metadata: params.metadata ? JSON.stringify(params.metadata) : null,
                created_at: new Date(),
            })
            .execute();
    } catch (error) {
        // We log error securely but do not let audit log failure break the auth flow
        securityLogger.error(
            'Failed to write auth audit log',
            error instanceof Error ? error : new Error(String(error)),
            {
                userId: params.userId ?? undefined,
                eventType: params.eventType,
            }
        );
    }
}

/**
 * Retrieve recent audit logs for a specific user or globally.
 */
export async function getRecentAuditLogs(userId?: string, limit = 50) {
    let query = db
        .selectFrom('auth.auth_audit_logs')
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit);

    if (userId) {
        query = query.where('user_id', '=', userId);
    }

    return await query.execute();
}
