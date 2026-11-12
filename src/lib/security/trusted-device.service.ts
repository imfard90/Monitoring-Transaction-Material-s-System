import { randomUUID } from 'crypto';
import { db } from '@/lib/db/db';
import { securityLogger } from '@/lib/logger';
import { logAuthEvent } from './auth-audit.service';

export const MAX_TRUSTED_DEVICES_PER_USER = 3;

export interface DeviceCheckResult {
    allowed: boolean;
    reason?: string;
    deviceId?: string;
    isNew?: boolean;
    deviceCount: number;
}

/**
 * Parses user agent string into human-readable device name.
 * e.g., "Chrome on macOS", "Safari on iPhone", "Edge on Windows"
 */
export function parseDeviceName(ua?: string | null): string {
    if (!ua) return 'Perangkat Tidak Dikenal';

    let browser = 'Browser';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome/')) browser = 'Google Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Apple Safari';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera';

    let os = 'Unknown OS';
    if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Linux')) os = 'Linux';

    return `${browser} (${os})`;
}

/**
 * Checks whether the current device is allowed for the user.
 * If the device fingerprint is already registered & active, it updates last_used_at.
 * If not registered and active count < 3, registers as new trusted device.
 * If active count >= 3, returns allowed: false with instructions to contact Administrator.
 */
export async function checkAndRegisterDevice(params: {
    userId: string;
    deviceFingerprint: string;
    deviceName?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    nik?: string | null;
}): Promise<DeviceCheckResult> {
    const { userId, deviceFingerprint, ipAddress, userAgent, nik } = params;
    const resolvedDeviceName = params.deviceName || parseDeviceName(userAgent);

    try {
        // Query active devices for this user
        const activeDevices = await db
            .selectFrom('auth.user_trusted_devices')
            .selectAll()
            .where('user_id', '=', userId)
            .where('is_revoked', '=', false)
            .execute();

        // Check if current fingerprint is already active
        const existingDevice = activeDevices.find(
            (d) => d.device_fingerprint === deviceFingerprint
        );

        if (existingDevice) {
            // Update last used timestamp and IP
            await db
                .updateTable('auth.user_trusted_devices')
                .set({
                    last_used_at: new Date(),
                    ip_address: ipAddress ?? existingDevice.ip_address,
                    user_agent: userAgent ?? existingDevice.user_agent,
                })
                .where('id', '=', existingDevice.id)
                .execute();

            return {
                allowed: true,
                deviceId: existingDevice.id,
                isNew: false,
                deviceCount: activeDevices.length,
            };
        }

        // New device: check 3-device limit
        if (activeDevices.length >= MAX_TRUSTED_DEVICES_PER_USER) {
            securityLogger.warn(
                'Device registration blocked: max 3 devices reached',
                {
                    userId,
                    deviceFingerprint,
                    activeCount: activeDevices.length,
                }
            );

            await logAuthEvent({
                userId,
                nik,
                eventType: 'LOGIN_BLOCKED_DEVICE_LIMIT',
                status: 'BLOCKED',
                ipAddress,
                userAgent,
                deviceName: resolvedDeviceName,
                deviceFingerprint,
                reason: 'Batas maksimal 3 perangkat telah tercapai. Hubungi Administrator.',
            });

            return {
                allowed: false,
                reason: 'Batas maksimal 3 perangkat terdaftar telah tercapai. Silakan hubungi Administrator untuk mengatur ulang perangkat.',
                deviceCount: activeDevices.length,
            };
        }

        // Under limit: register new trusted device
        const newDeviceId = randomUUID();
        const now = new Date();

        await db
            .insertInto('auth.user_trusted_devices')
            .values({
                id: newDeviceId,
                user_id: userId,
                device_name: resolvedDeviceName,
                device_fingerprint: deviceFingerprint,
                ip_address: ipAddress ?? null,
                user_agent: userAgent ?? null,
                last_used_at: now,
                created_at: now,
                is_revoked: false,
            })
            .execute();

        await logAuthEvent({
            userId,
            nik,
            eventType: 'DEVICE_REGISTERED',
            status: 'SUCCESS',
            ipAddress,
            userAgent,
            deviceName: resolvedDeviceName,
            deviceFingerprint,
            metadata: { deviceId: newDeviceId, totalActive: activeDevices.length + 1 },
        });

        return {
            allowed: true,
            deviceId: newDeviceId,
            isNew: true,
            deviceCount: activeDevices.length + 1,
        };
    } catch (error) {
        securityLogger.error(
            'Error checking trusted device',
            error instanceof Error ? error : new Error(String(error)),
            { userId }
        );
        throw error;
    }
}

/**
 * List all trusted devices for a user.
 */
export async function listUserDevices(userId: string) {
    return await db
        .selectFrom('auth.user_trusted_devices')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('is_revoked', 'asc')
        .orderBy('last_used_at', 'desc')
        .execute();
}

/**
 * Revoke a specific device for a user.
 */
export async function revokeUserDevice(
    userId: string,
    deviceId: string,
    revokedBy: string
): Promise<boolean> {
    const result = await db
        .updateTable('auth.user_trusted_devices')
        .set({
            is_revoked: true,
            revoked_at: new Date(),
            revoked_by: revokedBy,
        })
        .where('user_id', '=', userId)
        .where('id', '=', deviceId)
        .executeTakeFirst();

    const success = (result.numUpdatedRows ?? 0n) > 0n;

    if (success) {
        await logAuthEvent({
            userId,
            eventType: 'DEVICE_REVOKED',
            status: 'SUCCESS',
            reason: `Perangkat ${deviceId} dicabut oleh ${revokedBy}`,
            metadata: { deviceId, revokedBy },
        });
    }

    return success;
}

/**
 * Revoke all devices for a user (used during Admin MFA Reset).
 */
export async function resetAllUserDevices(userId: string, revokedBy: string): Promise<number> {
    const result = await db
        .updateTable('auth.user_trusted_devices')
        .set({
            is_revoked: true,
            revoked_at: new Date(),
            revoked_by: revokedBy,
        })
        .where('user_id', '=', userId)
        .where('is_revoked', '=', false)
        .executeTakeFirst();

    return Number(result.numUpdatedRows ?? 0n);
}
