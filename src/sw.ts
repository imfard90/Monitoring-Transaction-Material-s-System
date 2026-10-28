/// <reference lib="webworker" />
import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
        __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
}

const self = globalThis as unknown as ServiceWorkerGlobalScope;

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: defaultCache.filter((entry) => !entry.matcher?.toString().includes('api')),

    fallbacks: {
        entries: [
            {
                url: '/~offline',
                matcher({ request }) {
                    return request.destination === 'document';
                },
            },
        ],
    },
});

/**
 * Baseline 2026: Service Worker Static Routing API (event.addRoutes).
 * Declaratively instructs the browser engine to route sensitive API endpoints,
 * auth requests, and mutation POSTs directly to the network without waking up
 * the Service Worker JavaScript thread.
 * Conforms to AGENTS.md §3.4 (Service worker only caches static assets).
 */
self.addEventListener('install', (event: any) => {
    if (typeof event?.addRoutes === 'function') {
        try {
            event.addRoutes([
                {
                    condition: {
                        urlPattern: '/api/*',
                    },
                    source: 'network',
                },
                {
                    condition: {
                        urlPattern: '/auth/*',
                    },
                    source: 'network',
                },
                {
                    condition: {
                        requestMethod: 'POST',
                    },
                    source: 'network',
                },
            ]);
        } catch {
            // Silently fall back to Serwist runtimeCaching filter on legacy engines
        }
    }
});

serwist.addEventListeners();
