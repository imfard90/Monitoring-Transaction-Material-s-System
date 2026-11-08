/**
 * MTMS Animation System — unified exports.
 *
 * Three-library strategy:
 * - **Framer Motion** (35kb): Layout transitions, React orchestration
 * - **GSAP** (45kb): Dashboard charts, scroll-driven reveals
 * - **React Spring** (28kb): Form physics, drawer/modal feel
 *
 * All imports are lazy-loaded to avoid bloating the initial bundle. Use the
 * appropriate utility for each animation type — see individual module docs.
 *
 * Note: Anime.js was removed due to v4 API breaking changes. Use Framer Motion
 * for micro-interactions and counters instead.
 */

// Framer Motion presets (already installed)
export * from './motion-presets';

// GSAP utilities (lazy-loaded)
export {
    loadGSAP,
    revealChart,
    staggerReveal,
    drawPath,
    killAllGSAP,
    revealOnScroll,
} from './gsap-utils';

// React Spring utilities (lazy-loaded)
export {
    animated,
    springPresets,
    useDrawerSpring,
    useModalSpring,
    useButtonPressSpring,
    useNumberSpring,
    useFocusRingSpring,
} from './spring-utils';
