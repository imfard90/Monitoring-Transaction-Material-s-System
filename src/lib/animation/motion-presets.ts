/**
 * Framer Motion presets for MTMS.
 *
 * Consolidates common animation patterns from across the codebase. Motion is
 * the default choice for React layout transitions, mount/unmount, and state-driven
 * animations. Already installed (~35kb), handles `AnimatePresence` well.
 *
 * Use cases:
 * - Table row mount/unmount
 * - Modal/dialog transitions
 * - Sidebar navigation state
 * - Form field validation feedback
 */

import type { Variants, Transition } from 'framer-motion';

/**
 * Easing curves matching MTMS design tokens.
 */
export const easings = {
    easeOutExpo: [0.16, 1, 0.3, 1],
    easeInOutQuad: [0.45, 0, 0.55, 1],
    easeOutQuad: [0.25, 0.46, 0.45, 0.94],
} as const;

/**
 * Duration presets (milliseconds).
 */
export const durations = {
    fast: 150,
    normal: 300,
    slow: 500,
} as const;

/**
 * Fade + slide variants — most common MTMS pattern.
 */
export const fadeSlideVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: durations.normal / 1000,
            ease: easings.easeOutExpo,
        },
    },
    exit: {
        opacity: 0,
        y: -20,
        transition: {
            duration: durations.fast / 1000,
            ease: easings.easeInOutQuad,
        },
    },
};

/**
 * Stagger container variants — for lists (max 25 items).
 */
export const staggerContainerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.05,
        },
    },
};

/**
 * Stagger item variants — pair with staggerContainerVariants.
 */
export const staggerItemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 24,
        },
    },
};

/**
 * Modal scale variants — zoom in/out.
 */
export const modalScaleVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: {
            duration: durations.normal / 1000,
            ease: easings.easeOutExpo,
        },
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        transition: {
            duration: durations.fast / 1000,
            ease: easings.easeInOutQuad,
        },
    },
};

/**
 * Drawer slide variants — X-axis translation.
 */
export const drawerSlideVariants: Variants = {
    hidden: { x: '100%' },
    visible: {
        x: 0,
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 30,
        },
    },
    exit: {
        x: '100%',
        transition: {
            duration: durations.fast / 1000,
            ease: easings.easeInOutQuad,
        },
    },
};

/**
 * Spring transition preset — snappy physics.
 */
export const springTransition: Transition = {
    type: 'spring',
    stiffness: 300,
    damping: 24,
};

/**
 * Tween transition preset — easeOutExpo curve.
 */
export const tweenTransition: Transition = {
    duration: durations.normal / 1000,
    ease: easings.easeOutExpo,
};
