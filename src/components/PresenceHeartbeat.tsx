'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

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
        let interval: NodeJS.Timeout;
        let timeout: NodeJS.Timeout;

        const sendHeartbeat = async () => {
            if (!isMounted || stoppedRef.current) return;
            try {
                const res = await fetch('/api/presence', { method: 'POST' });

                if (res.status === 401) {
                    try {
                        const data = await res.json();
                        if (data?.forceLogout === true) {
                            // Dynamic import to avoid loading auth-client before needed
                            const { authClient } = await import('@/lib/auth-client');
                            await authClient.signOut();
                            router.push('/auth/login');
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
                            clearTimeout(timeout);
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
        timeout = setTimeout(() => {
            sendHeartbeat();
        }, 5000);

        interval = setInterval(sendHeartbeat, 30000);

        return () => {
            isMounted = false;
            clearTimeout(timeout);
            clearInterval(interval);
        };
    }, [router]);

    return null;
}
