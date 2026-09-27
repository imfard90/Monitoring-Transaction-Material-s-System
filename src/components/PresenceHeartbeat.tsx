'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { authClient } from '@/lib/auth-client';

export function PresenceHeartbeat() {
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;

        const sendHeartbeat = async () => {
            if (!isMounted) return;
            try {
                const res = await fetch('/api/presence', { method: 'POST' });
                
                // Only force logout if server explicitly says so
                if (res.status === 401) {
                    try {
                        const data = await res.json();
                        if (data?.forceLogout === true) {
                            await authClient.signOut();
                            router.push('/auth/login');
                        }
                        // Otherwise, silently ignore (e.g., session expired naturally)
                    } catch {
                        // Ignore JSON parse errors
                    }
                }
            } catch {
                // Ignore network errors
            }
        };

        // Small delay before first heartbeat so session is ready
        const timeout = setTimeout(() => {
            sendHeartbeat();
        }, 5000);
        
        const interval = setInterval(sendHeartbeat, 30000); // every 30 seconds

        return () => {
            isMounted = false;
            clearTimeout(timeout);
            clearInterval(interval);
        };
    }, [router]);

    return null;
}
