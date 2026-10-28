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
    try {
        const { logoutUser } = await import('@/app/auth/login/_actions/login-actions');
        await logoutUser();
    } catch {
        // Silently continue if logout action fails
    }
    const { authClient } = await import('@/lib/auth-client');
    await authClient.signOut();
    router.replace('/auth/login?reason=idle');
}

/**
 * PresenceHeartbeat / Idle Tracker
 *
 * Passive presence tracking:
 * - Presence is touched automatically on server-side actions/requests (getSessionUser)
 *   without periodic client polling, keeping browser console and network tabs clean.
 *
 * Idle tracking:
 * - Listens for DOM user activity events.
 * - Automatically signs out and redirects if inactive for IDLE_TIMEOUT_MS (30 minutes).
 */
export function PresenceHeartbeat() {
    const router = useRouter();
    const stoppedRef = useRef(false);

    useEffect(() => {
        // Guard against StrictMode double-invoke
        if (stoppedRef.current) return;

        let isSigningOut = false;
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

        return () => {
            clearTimeout(idleTimeout);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            for (const eventName of USER_ACTIVITY_EVENTS) {
                window.removeEventListener(eventName, resetIdleTimer);
            }
        };
    }, [router]);

    return null;
}
