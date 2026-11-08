import { type SpringValue, animated, useSpring } from '@react-spring/web';
import type React from 'react';
import { useEffect, useState } from 'react';

/**
 * Animated counter using React Spring.
 *
 * Respects `prefers-reduced-motion` by snapping instantly to the target value.
 * Smoothly interpolates numbers for sighted users with motion enabled.
 *
 * Returns the spring value and the animated component. Use the component to
 * render the counter with automatic formatting.
 *
 * @example
 * const { AnimatedNumber } = useNumberCounter(kpis.requestTag, (n) => n.toLocaleString('id-ID'));
 * return <AnimatedNumber />;
 */
export function useNumberCounter(
    value: number,
    formatter?: (n: number) => string
): {
    spring: SpringValue<number>;
    AnimatedNumber: () => React.ReactElement;
} {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReducedMotion(mediaQuery.matches);
        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const spring = useSpring({
        number: value,
        config: prefersReducedMotion ? { duration: 0 } : { tension: 170, friction: 26 },
    });

    const AnimatedNumber = () => (
        <animated.span>
            {spring.number.to((n) => (formatter ? formatter(n) : Math.floor(n).toString()))}
        </animated.span>
    );

    return { spring: spring.number, AnimatedNumber };
}
