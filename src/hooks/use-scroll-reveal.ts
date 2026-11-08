import { useEffect, useRef } from 'react';
import { revealOnScroll } from '@/lib/animation';

/**
 * Hook for scroll-triggered GSAP reveal animations.
 * Respects `prefers-reduced-motion` automatically.
 *
 * @example
 * const ref = useScrollReveal();
 * return <Card ref={ref}>...</Card>;
 */
export function useScrollReveal() {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;
        let cleanup: (() => void) | null = null;

        revealOnScroll(ref.current).then((cleanupFn) => {
            cleanup = cleanupFn;
        });

        return () => {
            cleanup?.();
        };
    }, []);

    return ref;
}
