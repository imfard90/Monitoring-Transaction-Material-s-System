'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'light',
    setTheme: () => {},
    resolvedTheme: 'light',
});

export function useTheme() {
    return useContext(ThemeContext);
}

interface ThemeProviderProps {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
    attribute?: string;
    enableSystem?: boolean;
    disableTransitionOnChange?: boolean;
}

function getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark', attribute: string, disableTransition: boolean) {
    const el = document.documentElement;
    let restore: (() => void) | null = null;

    if (disableTransition) {
        const style = document.createElement('style');
        style.textContent = '*,*::before,*::after{transition:none!important}';
        document.head.appendChild(style);
        restore = () => {
            window.getComputedStyle(document.body);
            setTimeout(() => document.head.removeChild(style), 1);
        };
    }

    if (attribute === 'class') {
        el.classList.remove('light', 'dark');
        el.classList.add(resolved);
    } else {
        el.setAttribute(attribute, resolved);
    }
    el.style.colorScheme = resolved;

    restore?.();
}

export function ThemeProvider({
    children,
    defaultTheme = 'light',
    storageKey = 'theme',
    attribute = 'class',
    enableSystem = true,
    disableTransitionOnChange = false,
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>(defaultTheme);
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

    // Baca storage setelah mount — menghindari mismatch SSR/hydration.
    // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only intentional — storageKey/defaultTheme/attribute stabil dari props, bukan state reaktif
    useEffect(() => {
        const stored = localStorage.getItem(storageKey) as Theme | null;
        const initial: Theme = stored ?? defaultTheme;
        setThemeState(initial);
        const resolved = initial === 'system' ? getSystemTheme() : initial;
        setResolvedTheme(resolved);
        applyTheme(resolved, attribute, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sinkron system theme saat preferensi OS berubah.
    useEffect(() => {
        if (!enableSystem) return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = () => {
            if (theme === 'system') {
                const resolved = getSystemTheme();
                setResolvedTheme(resolved);
                applyTheme(resolved, attribute, disableTransitionOnChange);
            }
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme, attribute, enableSystem, disableTransitionOnChange]);

    const setTheme = (next: Theme) => {
        setThemeState(next);
        try {
            localStorage.setItem(storageKey, next);
        } catch {}
        const resolved = next === 'system' ? getSystemTheme() : next;
        setResolvedTheme(resolved);
        applyTheme(resolved, attribute, disableTransitionOnChange);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
