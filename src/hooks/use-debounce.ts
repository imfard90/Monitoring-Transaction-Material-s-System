'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Standalone debounced function utility with cancel support.
 */
export function debounce<Args extends unknown[]>(
    callback: (...args: Args) => void,
    delayMs = 350
): ((...args: Args) => void) & { cancel: () => void } {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const debounced = (...args: Args) => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            callback(...args);
        }, delayMs);
    };

    debounced.cancel = () => {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return debounced;
}

/**
 * Hook to debounce a value by a specified delay in milliseconds.
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delayMs);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delayMs]);

    return debouncedValue;
}

/**
 * Hook that returns a debounced version of the passed callback function,
 * along with a cancel method to abort pending invocations.
 */
export function useDebouncedCallback<Args extends unknown[]>(
    callback: (...args: Args) => void,
    delayMs = 350
): ((...args: Args) => void) & { cancel: () => void } {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancel = useCallback(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    useEffect(() => cancel, [cancel]);

    const debounced = useCallback(
        (...args: Args) => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                callbackRef.current(...args);
            }, delayMs);
        },
        [delayMs]
    );

    return Object.assign(debounced, { cancel });
}
