/**
 * React Spring animation utilities for MTMS.
 *
 * Physics-based spring animations for natural, gesture-responsive interactions.
 * ~28kb gzipped — lighter than GSAP, better for form/modal feel.
 *
 * Use cases:
 * - Drawer/modal slide-ins with spring physics
 * - Form field focus/blur micro-interactions
 * - Gesture-driven drag interactions
 * - Natural bouncy transitions where CSS ease curves feel stiff
 */

import { useSpring, useSpringValue, animated, config } from '@react-spring/web';

export { animated };

/**
 * Spring presets matching MTMS motion design tokens.
 *
 * - `gentle`: Slow, smooth — good for large modals, drawers
 * - `snappy`: Quick, responsive — form interactions, buttons
 * - `wobbly`: Bouncy — playful micro-interactions, success states
 */
export const springPresets = {
    gentle: { tension: 280, friction: 60 },
    snappy: { tension: 340, friction: 30 },
    wobbly: { tension: 180, friction: 12 },
    default: config.default,
    stiff: config.stiff,
    slow: config.slow,
};

/**
 * Drawer slide spring — X-axis translation with snappy physics.
 *
 * @param open - Drawer visibility state
 * @param direction - Slide direction (`left` | `right`)
 * @returns Spring style object for `animated.div`
 *
 * @example
 * ```tsx
 * const style = useDrawerSpring(isOpen, 'right');
 * return <animated.div style={style}>Drawer content</animated.div>;
 * ```
 */
export function useDrawerSpring(open: boolean, direction: 'left' | 'right' = 'right') {
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return useSpring({
        transform:
            direction === 'right'
                ? open
                    ? 'translateX(0%)'
                    : 'translateX(100%)'
                : open
                  ? 'translateX(0%)'
                  : 'translateX(-100%)',
        config: prefersReducedMotion ? { duration: 0 } : springPresets.snappy,
    });
}

/**
 * Modal fade + scale spring — zoom-in effect.
 *
 * @param open - Modal visibility state
 * @returns Spring style object for `animated.div`
 *
 * @example
 * ```tsx
 * const style = useModalSpring(isOpen);
 * return <animated.div style={style}>Modal content</animated.div>;
 * ```
 */
export function useModalSpring(open: boolean) {
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return useSpring({
        opacity: open ? 1 : 0,
        transform: open ? 'scale(1)' : 'scale(0.95)',
        config: prefersReducedMotion ? { duration: 0 } : springPresets.gentle,
    });
}

/**
 * Button press spring — subtle scale-down on click.
 *
 * @param pressed - Press state (track via onMouseDown/onMouseUp)
 * @returns Spring style object for `animated.button`
 *
 * @example
 * ```tsx
 * const [pressed, setPressed] = useState(false);
 * const style = useButtonPressSpring(pressed);
 * return (
 *   <animated.button
 *     style={style}
 *     onMouseDown={() => setPressed(true)}
 *     onMouseUp={() => setPressed(false)}
 *   >
 *     Click me
 *   </animated.button>
 * );
 * ```
 */
export function useButtonPressSpring(pressed: boolean) {
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return useSpring({
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        config: prefersReducedMotion ? { duration: 0 } : springPresets.snappy,
    });
}

/**
 * Animated number spring — smooth count-up effect.
 *
 * @param target - Target numeric value
 * @param options - Spring config override
 * @returns Animated spring value (use `.to(n => n.toFixed(0))` for rendering)
 *
 * @example
 * ```tsx
 * const count = useNumberSpring(1234);
 * return <animated.span>{count.to(n => Math.round(n).toLocaleString('id-ID'))}</animated.span>;
 * ```
 */
export function useNumberSpring(target: number, options?: { config?: typeof config.default }) {
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return useSpringValue(target, {
        config: prefersReducedMotion ? { duration: 0 } : (options?.config ?? springPresets.gentle),
    });
}

/**
 * Focus ring spring — expand on focus, contract on blur.
 *
 * @param focused - Input focus state
 * @returns Spring style object for a pseudo-element or overlay
 *
 * @example
 * ```tsx
 * const [focused, setFocused] = useState(false);
 * const ringStyle = useFocusRingSpring(focused);
 * return (
 *   <div className="relative">
 *     <input onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
 *     <animated.div style={ringStyle} className="absolute inset-0 border-2 border-primary" />
 *   </div>
 * );
 * ```
 */
export function useFocusRingSpring(focused: boolean) {
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return useSpring({
        transform: focused ? 'scale(1.05)' : 'scale(1)',
        opacity: focused ? 1 : 0,
        config: prefersReducedMotion ? { duration: 0 } : springPresets.snappy,
    });
}
