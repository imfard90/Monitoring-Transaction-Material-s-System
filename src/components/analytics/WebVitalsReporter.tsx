'use client';

import { useReportWebVitals } from 'next/web-vitals';

/**
 * Reports real user Core Web Vitals (FCP, LCP, CLS, INP, TTFB)
 * to /api/telemetry/web-vitals via non-blocking Beacon API.
 */
export function WebVitalsReporter() {
    useReportWebVitals((metric) => {
        try {
            const body = JSON.stringify({
                id: metric.id,
                name: metric.name,
                value: metric.value,
                rating: metric.rating,
                delta: metric.delta,
                navigationType: metric.navigationType,
            });

            const url = '/api/telemetry/web-vitals';

            if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                const blob = new Blob([body], { type: 'application/json' });
                navigator.sendBeacon(url, blob);
            } else if (typeof fetch === 'function') {
                void fetch(url, {
                    body,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                }).catch(() => {});
            }
        } catch {
            // Telemetry failures are strictly non-fatal
        }
    });

    return null;
}

