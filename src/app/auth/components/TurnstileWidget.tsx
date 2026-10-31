'use client';

import { Loader2, ShieldCheck } from 'lucide-react';
import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile widget (explicit render).
 *
 * Renders the Turnstile widget into a div via the explicit
 * `turnstile.render(container, options)` API documented at:
 *   https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 *
 * Why explicit (not implicit) render?
 *   - We need React to control the lifecycle (`turnstile.remove()`
 *     on unmount, `turnstile.reset()` after token expiry).
 *   - We want to call `turnstile.execute()` lazily on form submit
 *     when a parent wants `appearance: 'interaction-only'`.
 *
 * Props:
 *   - `onToken(token)`      invoked when the visitor solves the challenge.
 *   - `onExpire()`          invoked when the issued token expires.
 *   - `onError(code)`       invoked on widget error; code is the
 *                           Cloudflare error code (3-digit family).
 *   - `action`              optional Turnstile `action` for
 *                           server-side action pinning.
 *   - `appearance`          'always' (default) | 'execute' | 'interaction-only'.
 *   - `theme`               'auto' (default) | 'light' | 'dark'.
 *   - `className`           wrapper Tailwind classes for layout.
 */
export interface TurnstileWidgetProps {
    onToken: (token: string) => void;
    onExpire?: () => void;
    onError?: (errorCode: string) => void;
    /** Optional Turnstile action for advanced server-side validation. */
    action?: string;
    /** When the widget should appear. */
    appearance?: 'always' | 'execute' | 'interaction-only';
    /** Visual theme. */
    theme?: 'auto' | 'light' | 'dark';
    /** Wrapper className. */
    className?: string;
}

// Module-level types for the global `turnstile` object loaded by the
// official script. We avoid `any` so Biome's `noExplicitAny` is happy.
declare global {
    interface Window {
        __mtmsTurnstileToken?: string;
        turnstile?: {
            render: (
                container: string | HTMLElement,
                options: {
                    sitekey: string;
                    callback?: (token: string) => void;
                    'error-callback'?: (errorCode: string) => void;
                    'expired-callback'?: () => void;
                    action?: string;
                    appearance?: 'always' | 'execute' | 'interaction-only';
                    theme?: 'auto' | 'light' | 'dark';
                    execution?: 'render' | 'execute';
                }
            ) => string;
            reset: (widgetId?: string | HTMLElement) => void;
            remove: (widgetId?: string | HTMLElement) => void;
            execute: (widgetId?: string | HTMLElement) => void;
        };
        onTurnstileLoad?: () => void;
    }
}

const TURNSTILE_SCRIPT_SRC =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';

export default function TurnstileWidget({
    onToken,
    onExpire,
    onError,
    action,
    appearance = 'always',
    theme = 'auto',
    className,
}: TurnstileWidgetProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    // Stable, unique container id so we never collide with multiple
    // widgets on the same page.
    const reactId = useId();
    const containerId = `turnstile-widget-${reactId.replace(/[:]/g, '')}`;

    const [scriptReady, setScriptReady] = useState(false);
    const [widgetError, setWidgetError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    const onTokenRef = useRef(onToken);
    const onExpireRef = useRef(onExpire);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onTokenRef.current = onToken;
        onExpireRef.current = onExpire;
        onErrorRef.current = onError;
    }, [onToken, onExpire, onError]);

    const renderWidget = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (!window.turnstile) return;
        if (!containerRef.current) return;
        if (widgetIdRef.current) return; // already rendered

        const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        if (!sitekey) {
            const msg = 'Konfigurasi Turnstile tidak ditemukan (NEXT_PUBLIC_TURNSTILE_SITE_KEY).';
            setWidgetError(msg);
            securityLogClient('config-missing', msg);
            onErrorRef.current?.('config-missing');
            return;
        }

        try {
            widgetIdRef.current = window.turnstile.render(containerRef.current, {
                sitekey,
                action,
                appearance,
                theme,
                callback: (token: string) => {
                    setWidgetError(null);
                    setIsVerifying(false);
                    window.__mtmsTurnstileToken = token;
                    onTokenRef.current(token);
                },
                'error-callback': (code: string) => {
                    setIsVerifying(false);
                    const msg = `Widget Turnstile gagal (${code}). Silakan muat ulang halaman.`;
                    setWidgetError(msg);
                    securityLogClient('widget-error', code);
                    onErrorRef.current?.(code);
                },
                'expired-callback': () => {
                    setIsVerifying(false);
                    setWidgetError('Verifikasi keamanan kedaluwarsa. Silakan coba lagi.');
                    window.__mtmsTurnstileToken = '';
                    onTokenRef.current('');
                    onExpireRef.current?.();
                },
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Gagal memuat widget Turnstile.';
            setWidgetError(msg);
            setIsVerifying(false);
            onErrorRef.current?.('render-failed');
        }
    }, [action, appearance, theme]);

    // Wire the global onload callback (idempotent — Next.js Script
    // re-runs it on every page load, but our render is idempotent too).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.onTurnstileLoad = () => {
            setScriptReady(true);
            renderWidget();
        };
        // If the script was already loaded before this effect (e.g. the
        // page hydrated after a soft navigation), render immediately.
        if (window.turnstile && !widgetIdRef.current) {
            setScriptReady(true);
            renderWidget();
        }
    }, [renderWidget]);

    // Re-render whenever scriptReady flips, in case the load callback
    // ran before the effect wired it.
    useEffect(() => {
        if (scriptReady) renderWidget();
    }, [scriptReady, renderWidget]);

    // Cleanup: remove the widget from the DOM when the component
    // unmounts so we don't leak the iframe.
    useEffect(() => {
        return () => {
            if (typeof window === 'undefined') return;
            if (widgetIdRef.current && window.turnstile) {
                try {
                    window.turnstile.remove(widgetIdRef.current);
                } catch {
                    // Ignore — widget may already be gone.
                }
                widgetIdRef.current = null;
            }
        };
    }, []);

    /**
     * Public helper exposed via ref: lets a parent reset the widget
     * after a failed submission so the visitor doesn't have to wait
     * for natural expiry. We attach it to a ref-style callback.
     */
    useEffect(() => {
        if (typeof window === 'undefined') return;
        // Expose a tiny imperative API for forms.
        (window as unknown as Record<string, unknown>).__turnstileReset = () => {
            if (widgetIdRef.current && window.turnstile) {
                try {
                    window.turnstile.reset(widgetIdRef.current);
                } catch {
                    /* ignore */
                }
            }
            setIsVerifying(true);
        };
    }, []);

    return (
        <div className={className} data-testid="turnstile-widget">
            <Script
                src={TURNSTILE_SCRIPT_SRC}
                strategy="afterInteractive"
                async
                defer
                onLoad={() => {
                    // Some browsers don't fire window.onTurnstileLoad reliably;
                    // treat script load as a fallback render trigger.
                    if (window.turnstile && !widgetIdRef.current) {
                        setScriptReady(true);
                        renderWidget();
                    }
                }}
                onError={() => {
                    const msg = 'Gagal memuat skrip Turnstile. Periksa koneksi Anda.';
                    setWidgetError(msg);
                    setIsVerifying(false);
                    onErrorRef.current?.('script-load-failed');
                }}
            />

            {widgetError ? (
                <div
                    role="alert"
                    className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2"
                >
                    {widgetError}
                </div>
            ) : null}

            {isVerifying && !widgetError ? (
                <div
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                    aria-live="polite"
                >
                    <Loader2 className="size-4 animate-spin" />
                    Memverifikasi keamanan...
                </div>
            ) : null}

            {!widgetError && !isVerifying ? (
                <div
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    aria-live="polite"
                >
                    <ShieldCheck className="size-3.5" />
                    Dilindungi Cloudflare Turnstile
                </div>
            ) : null}

            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 mt-1">
                {/* Cloudflare Turnstile Captcha Box */}
                <div
                    id={containerId}
                    ref={containerRef}
                    className="cf-turnstile min-h-[65px] min-w-[300px] shrink-0"
                    data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                />

                {/* Iconic Shield WAF Badge (Sejajar dengan Turnstile) */}
                <div
                    className="flex-1 min-w-[96px] h-[65px] px-2.5 py-1.5 rounded-xl border border-primary/20 bg-linear-to-b from-primary/10 via-primary/5 to-transparent dark:from-primary/15 dark:to-transparent flex flex-col justify-center items-center text-center shadow-xs select-none relative overflow-hidden group/waf"
                    title="Cloudflare WAF: Perlindungan firewall aplikasi web aktif melawan ancaman bot & DDoS"
                >
                    <div className="absolute -right-3 -top-3 size-10 bg-primary/20 rounded-full blur-md group-hover/waf:scale-125 transition-transform" />

                    <div className="relative flex items-center justify-center">
                        <ShieldCheck className="size-5 text-primary drop-shadow-xs" />
                        <span className="absolute -top-0.5 -right-0.5 flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                        </span>
                    </div>

                    <span className="text-[11px] font-bold tracking-tight text-foreground leading-tight mt-1">
                        Shield WAF
                    </span>
                    <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 leading-none">
                        Active Guard
                    </span>
                </div>
            </div>
        </div>
    );
}

/**
 * Lightweight client-side log helper. We deliberately do NOT log
 * the token (or any part of it) on the client — the security
 * surface of the widget includes avoiding token leakage to console.
 */
function securityLogClient(event: string, detail: string): void {
    if (typeof window === 'undefined') return;
    // Send to the same logger via a custom event so a future
    // observability hook can pick it up. For now we keep the console
    // warning opt-in only on `development` and never in production.
    if (process.env.NODE_ENV !== 'production') {
        // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
        // eslint-disable-next-line no-console
        console.warn(`[Turnstile:${event}]`, detail);
    }
}
