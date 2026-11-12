'use client';

/**
 * Generates or retrieves a persistent client device fingerprint.
 * Uses a persistent localStorage UUID combined with browser characteristics
 * to uniquely and stably identify the user's device.
 */
export async function getClientDeviceFingerprint(): Promise<{
    fingerprint: string;
    deviceName: string;
}> {
    if (typeof window === 'undefined') {
        return { fingerprint: 'server-unknown', deviceName: 'Unknown Device' };
    }

    const STORAGE_KEY = 'mtms_device_uuid';
    let deviceUuid = localStorage.getItem(STORAGE_KEY);
    if (!deviceUuid) {
        deviceUuid =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        try {
            localStorage.setItem(STORAGE_KEY, deviceUuid);
        } catch {
            // In case localStorage is disabled (private browsing restrictions)
        }
    }

    const ua = navigator.userAgent;
    const lang = navigator.language || 'id';
    const screenRes = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 24}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';

    // Hash browser traits
    const rawString = `${deviceUuid}|${ua}|${lang}|${screenRes}|${tz}`;
    let hashHex = deviceUuid;
    try {
        const msgBuffer = new TextEncoder().encode(rawString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
        // Fallback to deviceUuid
    }

    // Friendly Device Name
    let browser = 'Browser';
    if (ua.includes('Edg/')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome/')) browser = 'Google Chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Apple Safari';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera';

    let os = 'OS';
    if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Linux')) os = 'Linux';

    return {
        fingerprint: hashHex,
        deviceName: `${browser} (${os})`,
    };
}
