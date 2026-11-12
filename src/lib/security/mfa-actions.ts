'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { pool } from '@/lib/db/db';
import { actionLogger, securityLogger } from '@/lib/logger';
import { redis } from '@/lib/redis';
import { logAuthEvent } from './auth-audit.service';
import {
    checkAndRegisterDevice,
    listUserDevices,
    MAX_TRUSTED_DEVICES_PER_USER,
} from './trusted-device.service';

const checkDeviceSchema = z.object({
    deviceFingerprint: z.string().min(8).max(128),
    deviceName: z.string().max(100).optional(),
});

const verifyTotpSchema = z.object({
    code: z.string().regex(/^\d{6}$/, 'Format kode OTP harus 6 digit angka'),
    purpose: z.string().min(1).max(100),
});

/**
 * Extracts client IP from incoming Next.js request headers.
 */
function extractClientIp(headerBag: Headers): string | null {
    const candidates = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'true-client-ip'];
    for (const name of candidates) {
        const raw = headerBag.get(name);
        if (!raw) continue;
        const first = raw.split(',')[0]?.trim();
        if (first) return first;
    }
    return null;
}

/**
 * Server action called after sign-in / TOTP verification to enforce
 * the 3-device registration limit policy.
 */
export async function checkDeviceAction(params: {
    deviceFingerprint: string;
    deviceName?: string;
}) {
    const parsed = checkDeviceSchema.safeParse(params);
    if (!parsed.success) {
        return {
            success: false,
            blocked: false,
            error: 'Parameter perangkat tidak valid.',
        };
    }

    try {
        const reqHeaders = await headers();
        const session = await auth.api.getSession({ headers: reqHeaders });

        if (!session?.user?.id) {
            return {
                success: false,
                blocked: false,
                error: 'Sesi login tidak valid. Silakan masuk kembali.',
            };
        }

        const userId = session.user.id;
        const nik = (session.user as { nik?: string }).nik ?? null;
        const ipAddress = extractClientIp(reqHeaders);
        const userAgent = reqHeaders.get('user-agent');

        const result = await checkAndRegisterDevice({
            userId,
            deviceFingerprint: parsed.data.deviceFingerprint,
            deviceName: parsed.data.deviceName,
            ipAddress,
            userAgent,
            nik,
        });

        if (!result.allowed) {
            // Maximum device limit exceeded: kill the active session immediately!
            try {
                if (session.session?.token) {
                    await redis.del(session.session.token);
                    await redis.del(`active-sessions-${userId}`);
                }
                await pool.query('DELETE FROM auth.session WHERE "userId" = $1', [userId]);
            } catch (err) {
                actionLogger.error(
                    'Failed to kill session on device limit block',
                    err instanceof Error ? err : new Error(String(err)),
                    { userId }
                );
            }

            return {
                success: false,
                blocked: true,
                error: result.reason,
                deviceCount: result.deviceCount,
            };
        }

        return {
            success: true,
            blocked: false,
            deviceId: result.deviceId,
            isNew: result.isNew,
            deviceCount: result.deviceCount,
        };
    } catch (error) {
        securityLogger.error(
            'Error in checkDeviceAction',
            error instanceof Error ? error : new Error(String(error))
        );
        return {
            success: false,
            blocked: false,
            error: 'Gagal memverifikasi perangkat. Silakan coba lagi.',
        };
    }
}

/**
 * Verifies TOTP code for sensitive business operations (e.g. Cancel InOut Tag).
 * Can be called with the reusable MFA dialog on client side.
 */
export async function verifyTotpForSensitiveAction(code: string, purpose: string) {
    const parsed = verifyTotpSchema.safeParse({ code, purpose });
    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message || 'Data verifikasi tidak valid.',
        };
    }

    const reqHeaders = await headers();
    let sessionUser: { id: string; nik?: string } | null = null;

    try {
        const session = await auth.api.getSession({ headers: reqHeaders });
        if (!session?.user?.id) {
            return { success: false, error: 'Sesi telah berakhir. Silakan login kembali.' };
        }
        sessionUser = { id: session.user.id, nik: (session.user as { nik?: string }).nik };

        // Better Auth TOTP verification endpoint
        await auth.api.verifyTOTP({
            body: { code: parsed.data.code },
            headers: reqHeaders,
        });

        if (sessionUser.nik) {
            try {
                await redis.set(
                    `mfa:grant:${sessionUser.nik}:${parsed.data.purpose}`,
                    '1',
                    'EX',
                    120
                );
            } catch {
                // Non-blocking redis grant
            }
        }

        await logAuthEvent({
            userId: sessionUser.id,
            nik: sessionUser.nik,
            eventType: 'MFA_VERIFY_SUCCESS',
            status: 'SUCCESS',
            reason: `Verifikasi TOTP berhasil untuk aksi: ${parsed.data.purpose}`,
            metadata: { purpose: parsed.data.purpose },
            ipAddress: extractClientIp(reqHeaders),
            userAgent: reqHeaders.get('user-agent'),
        });

        return { success: true };
    } catch (error) {
        if (sessionUser) {
            await logAuthEvent({
                userId: sessionUser.id,
                nik: sessionUser.nik,
                eventType: 'MFA_VERIFY_FAILED',
                status: 'FAILED',
                reason: `Verifikasi TOTP gagal untuk aksi: ${parsed.data.purpose}`,
                metadata: { purpose: parsed.data.purpose },
                ipAddress: extractClientIp(reqHeaders),
                userAgent: reqHeaders.get('user-agent'),
            });
        }

        return {
            success: false,
            error: 'Kode OTP tidak valid atau telah kadaluarsa. Pastikan jam perangkat Anda akurat.',
        };
    }
}

/**
 * Returns current user's MFA & trusted devices status.
 */
export async function getUserMfaStatusAction() {
    try {
        const reqHeaders = await headers();
        const session = await auth.api.getSession({ headers: reqHeaders });

        if (!session?.user?.id) {
            return {
                twoFactorEnabled: false,
                activeDevicesCount: 0,
                maxDevices: MAX_TRUSTED_DEVICES_PER_USER,
            };
        }

        const devices = await listUserDevices(session.user.id);
        const activeDevices = devices.filter((d) => !d.is_revoked);
        const twoFactorEnabled = !!(session.user as { twoFactorEnabled?: boolean })
            .twoFactorEnabled;

        return {
            twoFactorEnabled,
            activeDevicesCount: activeDevices.length,
            maxDevices: MAX_TRUSTED_DEVICES_PER_USER,
        };
    } catch {
        return {
            twoFactorEnabled: false,
            activeDevicesCount: 0,
            maxDevices: MAX_TRUSTED_DEVICES_PER_USER,
        };
    }
}
