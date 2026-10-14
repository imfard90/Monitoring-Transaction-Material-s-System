'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { IDLE_TIMEOUT_MS, resetIdleTimeout } from '@/lib/idle-timeout';

const USER_ACTIVITY_EVENTS = [
    'keydown',
    'pointerdown',
    'pointermove',
    'scroll',
    'touchstart',
] as const;

async function signOutAndRedirect(router: ReturnType<typeof useRouter>): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    await authClient.signOut();
    router.replace('/auth/login?reason=idle');
}

/**
 * PresenceHeartbeat — fires POST /api/presence every 30s.
 * The server handles all role logic:
 *   - Staff → returns { skipped: true }, client stops the interval permanently.
 *   - Concurrent session detected → returns { forceLogout: true }, client signs out.
 * No client-side role check needed; avoids dependency on session data not exposed to the client.
 */
export function PresenceHeartbeat() {
    const router = useRouter();
    const stoppedRef = useRef(false);

    useEffect(() => {
        // Guard against StrictMode double-invoke
        if (stoppedRef.current) return;

        let isMounted = true;
        let isSigningOut = false;
        let interval: ReturnType<typeof setInterval>;
        let heartbeatTimeout: ReturnType<typeof setTimeout>;
        let idleTimeout: ReturnType<typeof setTimeout>;

        const resetIdleTimer = () => {
            clearTimeout(idleTimeout);
            if (document.visibilityState === 'visible' && !isSigningOut) {
                idleTimeout = resetIdleTimeout(() => {
                    isSigningOut = true;
                    void signOutAndRedirect(router).catch(() => {
                        window.location.assign('/auth/login?reason=idle');
                    });
                }, IDLE_TIMEOUT_MS);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                clearTimeout(idleTimeout);
            } else {
                resetIdleTimer();
            }
        };

        for (const eventName of USER_ACTIVITY_EVENTS) {
            window.addEventListener(eventName, resetIdleTimer, { passive: true });
        }
        document.addEventListener('visibilitychange', handleVisibilityChange);
        resetIdleTimer();

        const sendHeartbeat = async () => {
            if (!isMounted || stoppedRef.current || isSigningOut) return;
            try {
                const res = await fetch('/api/presence', { method: 'POST' });

                if (res.status === 401) {
                    try {
                        const data = await res.json();
                        if (data?.forceLogout === true) {
                            isSigningOut = true;
                            await signOutAndRedirect(router);
                        }
                    } catch {
                        // Ignore JSON parse errors
                    }
                } else if (res.status === 200) {
                    try {
                        const data = await res.json();
                        if (data?.skipped === true) {
                            // Server says skip — permanently stop heartbeat
                            stoppedRef.current = true;
                            isMounted = false;
                            clearTimeout(heartbeatTimeout);
                            clearInterval(interval);
                        }
                    } catch {
                        // Ignore JSON parse errors
                    }
                }
            } catch {
                // Ignore network errors silently
            }
        };

        // Small delay before first heartbeat so page has settled
        heartbeatTimeout = setTimeout(() => {
            sendHeartbeat();
        }, 5000);

        interval = setInterval(sendHeartbeat, 30000);

        return () => {
            isMounted = false;
            clearTimeout(heartbeatTimeout);
            clearTimeout(idleTimeout);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            for (const eventName of USER_ACTIVITY_EVENTS) {
                window.removeEventListener(eventName, resetIdleTimer);
            }
        };
    }, [router]);

    return null;
}
