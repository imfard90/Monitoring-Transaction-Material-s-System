/**
 * MTMS Animation System — unified exports.
 *
 * Two-library strategy:
 * - **Framer Motion** (35kb): Layout transitions, React orchestration
 * - **React Spring** (28kb): Form physics, drawer/modal feel, number counters
 *
 * All imports are lazy-loaded to avoid bloating the initial bundle.
 *
 * Note: GSAP was removed — dashboard operational charts don't need scroll animations.
 * Note: Anime.js was removed due to v4 API breaking changes.
 */

// Framer Motion presets (already installed)
export * from './motion-presets';

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
