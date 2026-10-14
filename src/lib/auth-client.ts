import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
    fetchOptions: {
        headers: () => {
            if (typeof window === 'undefined') return {};
            const token = (window as Window & { __mtmsTurnstileToken?: string })
                .__mtmsTurnstileToken;
            return token ? { 'x-captcha-response': token } : {};
        },
    },
    plugins: [twoFactorClient()],
});
