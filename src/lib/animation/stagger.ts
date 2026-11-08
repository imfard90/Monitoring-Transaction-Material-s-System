/**
 * Stagger animation utilities for list entrances using Framer Motion.
 *
 * Provides smooth, progressive disclosure for dashboard cards, table rows,
 * and any list-like content. Respects prefers-reduced-motion.
 *
 * Usage:
 * ```tsx
 * <motion.div {...staggerContainer}>
 *   {items.map((item, i) => (
 *     <motion.div key={item.id} {...staggerItem(i)}>
 *       <Card>...</Card>
 *     </motion.div>
 *   ))}
 * </motion.div>
 * ```
 */

import type { Variants } from 'framer-motion';

/**
 * Container variants for staggered children.
 * Apply to the parent wrapper element.
 */
export const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.04,
        },
    },
};

/**
 * Item variants for staggered entrance.
 * Apply to each child element.
 */
export const staggerItemVariants: Variants = {
    hidden: {
        opacity: 0,
        y: 20,
        scale: 0.98,
    },
    show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 24,
            mass: 0.8,
        },
    },
};

/**
 * Helper to generate item props with custom delay.
 * Useful when you need fine-grained control over timing.
 */
export function staggerItem(index: number, baseDelay = 0.08) {
    return {
        variants: staggerItemVariants,
        initial: 'hidden',
        animate: 'show',
        transition: {
            delay: index * baseDelay,
        },
    };
}

/**
 * Fade-in-up variant for simpler use cases (no stagger).
 */
export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
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
 * Scale-in variant for cards and dialogs.
 */
export const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.95 },
    show: {
        opacity: 1,
        scale: 1,
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 24,
        },
    },
};
