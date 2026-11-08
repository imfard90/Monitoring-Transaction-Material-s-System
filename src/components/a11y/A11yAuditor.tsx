'use client';

import { useEffect } from 'react';

/**
 * Development-only accessibility auditor loader.
 *
 * Dynamically imports and initializes @axe-core/react in dev mode only.
 * Tree-shaken away in production builds.
 */
export function A11yAuditor() {
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            import('@/lib/a11y-dev').then((mod) => mod.initA11yAuditor());
        }
    }, []);

    return null;
}
