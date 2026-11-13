import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * Animated counter using native requestAnimationFrame.
 *
 * Respects `prefers-reduced-motion` by snapping instantly to the target value.
 * Smoothly interpolates numbers with 60fps/120fps precision and zero external libraries.
 *
 * @example
 * const { AnimatedNumber } = useNumberCounter(kpis.requestTag, (n) => n.toLocaleString('id-ID'));
 * return <AnimatedNumber />;
 */
export function useNumberCounter(
    value: number,
    formatter?: (n: number) => string
): {
    AnimatedNumber: () => React.ReactElement;
} {
    const [displayValue, setDisplayValue] = useState(value);
    const prevValueRef = useRef(value);

    useEffect(() => {
        if (typeof window === 'undefined') {
            setDisplayValue(value);
            return;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            setDisplayValue(value);
            prevValueRef.current = value;
            return;
        }

        const startValue = prevValueRef.current;
        const targetValue = value;
        const duration = 600; // ms
        const startTime = performance.now();

        let animFrameId: number;

        const updateNumber = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic: 1 - (1 - progress)^3
            const easeOutProgress = 1 - (1 - progress) ** 3;
            const current = startValue + (targetValue - startValue) * easeOutProgress;

            setDisplayValue(current);

            if (progress < 1) {
                animFrameId = requestAnimationFrame(updateNumber);
            } else {
                prevValueRef.current = targetValue;
            }
        };

        animFrameId = requestAnimationFrame(updateNumber);

        return () => {
            cancelAnimationFrame(animFrameId);
        };
    }, [value]);

    const formattedText = formatter ? formatter(displayValue) : Math.floor(displayValue).toString();

    const AnimatedNumber = () => <span>{formattedText}</span>;

    return { AnimatedNumber };
}

