import type React from 'react';

/**
 * Auth Layout ensures all authentication pages (/auth/login, /auth/forgot-password,
 * /auth/register, /auth/mfa, /auth/reset-password, /auth/error) are strictly dynamically
 * rendered at request time so Next.js attaches per-request CSP nonces to all scripts.
 */
export const dynamic = 'force-dynamic';

export default function AuthLayoutWrapper({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

