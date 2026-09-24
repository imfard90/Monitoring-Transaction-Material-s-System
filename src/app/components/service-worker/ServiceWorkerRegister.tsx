'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker
                    .register('/serwist/sw.js')
                    .then((_reg) => {})
                    .catch((_err) => {});
            });
        }
    }, []);

    return null;
}
