/**
 * GSAP animation utilities for MTMS.
 *
 * Dynamic import strategy — GSAP is ~45kb gzipped. Load only when timeline
 * orchestration or scroll-driven sequences are needed (dashboard charts,
 * complex reveals). For simple transitions, use Framer Motion or CSS.
 *
 * Use cases:
 * - Dashboard chart sequential reveals
 * - Scroll-triggered data visualization
 * - Coordinated multi-element timelines
 */

import type { gsap as GSAPType } from 'gsap';
import type { ScrollTrigger as ScrollTriggerType } from 'gsap/ScrollTrigger';

let gsapInstance: typeof GSAPType | null = null;
let scrollTriggerInstance: typeof ScrollTriggerType | null = null;

/**
 * Lazy-load GSAP core + ScrollTrigger plugin.
 *
 * Caches the instance so repeated calls don't re-import. Call once at the
 * top of a component that needs GSAP, then use the returned `gsap` instance.
 */
export async function loadGSAP() {
    if (gsapInstance && scrollTriggerInstance) {
        return { gsap: gsapInstance, ScrollTrigger: scrollTriggerInstance };
    }

    const [gsapModule, scrollTriggerModule] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
    ]);

    gsapInstance = gsapModule.gsap;
    scrollTriggerInstance = scrollTriggerModule.ScrollTrigger;
    gsapInstance.registerPlugin(scrollTriggerInstance);

    return { gsap: gsapInstance, ScrollTrigger: scrollTriggerInstance };
}

/**
 * Chart reveal animation — fade + slide from below.
 *
 * Triggers when the chart enters the viewport (80% from top). Respects
 * `prefers-reduced-motion` by disabling the animation when the user opts out.
 */
export async function revealChart(
    element: HTMLElement,
    options?: {
        delay?: number;
        duration?: number;
        scrollTriggerStart?: string;
    }
) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        element.style.opacity = '1';
        return null;
    }

    const { gsap } = await loadGSAP();

    return gsap.from(element, {
        opacity: 0,
        y: 40,
        duration: options?.duration ?? 0.8,
        delay: options?.delay ?? 0,
        ease: 'power2.out',
        scrollTrigger: {
            trigger: element,
            start: options?.scrollTriggerStart ?? 'top 80%',
            toggleActions: 'play none none reverse',
        },
    });
}

/**
 * Staggered list reveal — animate children sequentially.
 *
 * Each child fades + slides with a 0.1s delay between items. Caps at 25 items
 * to avoid performance degradation on large tables (matches MTMS DataTable pattern).
 */
export async function staggerReveal(
    container: HTMLElement,
    childSelector: string,
    options?: {
        stagger?: number;
        maxItems?: number;
    }
) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        return null;
    }

    const { gsap } = await loadGSAP();
    const children = Array.from(container.querySelectorAll(childSelector));
    const maxItems = options?.maxItems ?? 25;
    const targets = children.slice(0, maxItems);

    return gsap.from(targets, {
        opacity: 0,
        y: 20,
        duration: 0.5,
        stagger: options?.stagger ?? 0.1,
        ease: 'power2.out',
    });
}

/**
 * Draw SVG path animation — stroke-dashoffset trick.
 *
 * Animates an SVG path as if it's being drawn. Useful for chart lines or
 * decorative strokes. The path must have a `stroke` defined in CSS/attributes.
 */
export async function drawPath(pathElement: SVGPathElement, duration = 1.5) {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        return null;
    }

    const { gsap } = await loadGSAP();
    const length = pathElement.getTotalLength();

    pathElement.style.strokeDasharray = `${length}`;
    pathElement.style.strokeDashoffset = `${length}`;

    return gsap.to(pathElement, {
        strokeDashoffset: 0,
        duration,
        ease: 'power2.inOut',
    });
}

/**
 * Kill all GSAP animations and ScrollTriggers on cleanup.
 *
 * Call this in a component's cleanup (useEffect return, unmount) to prevent
 * memory leaks and orphaned scroll listeners.
 */
export async function killAllGSAP() {
    if (!gsapInstance || !scrollTriggerInstance) return;
    gsapInstance.killTweensOf('*');
    // biome-ignore lint/suspicious/useIterableCallbackReturn: forEach for side effect
    scrollTriggerInstance.getAll().forEach((st) => st.kill());
}

/**
 * Scroll-triggered reveal with cleanup.
 *
 * Returns a cleanup function that kills the animation and ScrollTrigger instance
 * when the component unmounts. Use with `useScrollReveal` hook for automatic lifecycle.
 */
export async function revealOnScroll(element: HTMLElement): Promise<() => void> {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        element.style.opacity = '1';
        return () => {};
    }

    // Check if element is already visible in viewport — skip animation to prevent delayed render
    const rect = element.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.top < window.innerHeight * 0.8;

    if (isVisible) {
        element.style.opacity = '1';
        return () => {};
    }

    // Below fold: apply scroll-triggered animation
    element.style.opacity = '0';
    element.style.transform = 'translateY(40px)';

    const { gsap, ScrollTrigger } = await loadGSAP();

    const tween = gsap.to(element, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
            trigger: element,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
        },
    });

    return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
    };
}
