# MTMS Animation System

## Installed Libraries

| Library | Version | Size (gzip) | Status | Primary Use Case |
|---------|---------|-------------|--------|------------------|
| **Framer Motion** | 14.9.1 | ~35kb | ✅ Production | Layout transitions, React state orchestration |
| **GSAP** | 3.15.1 | ~45kb | ✅ Ready | Dashboard chart sequences, scroll-driven reveals |
| **React Spring** | 10.1.2 | ~28kb | ✅ Ready | Form physics, drawer/modal natural feel |
| **Anime.js** | 4.5.0 | ~9kb | ⚠️ API Breaking | v4 requires rewrite — defer to future sprint |

## Architecture

Animation utilities live in `src/lib/animation/` with lazy-loading to avoid bundle bloat:

```
src/lib/animation/
├── index.ts              # Barrel exports
├── motion-presets.ts     # Framer Motion variants (✅ ready)
├── gsap-utils.ts         # GSAP helpers (✅ ready)
├── spring-utils.ts       # React Spring hooks (✅ ready)
└── anime-utils.ts        # ⚠️ Anime.js v4 needs API update
```

## Library Selection Guide

### Use **Framer Motion** when:
- Animating React component mount/unmount (`AnimatePresence`)
- Layout shifts (reordering, expand/collapse)
- Simple fade/slide transitions
- State-driven UI changes

**Example**: Table row animations, modal dialogs, sidebar navigation

### Use **GSAP** when:
- Coordinating multiple elements in a timeline
- Scroll-triggered reveals (ScrollTrigger)
- SVG path drawing
- Complex sequential animations

**Example**: Dashboard chart stagger reveals, hero section orchestration

### Use **React Spring** when:
- Gesture-driven interactions (drag, swipe)
- Physics-based motion feels better than easing curves
- Form field micro-interactions
- Drawer/modal slide with natural bounce

**Example**: Form drawer physics, button press feedback

### ⚠️ Anime.js Status
v4.5.0 introduced breaking API changes:
- v3: `anime({ targets, ...params })`
- v4: `animate(targets, params)` + different callback structure

**Recommendation**: Use Framer Motion for counters/micro-interactions until Anime.js v4 patterns stabilized. Current utils need full rewrite.

## Implementation Examples

### GSAP Chart Reveal (Dashboard)

```tsx
import { useEffect, useRef } from 'react';
import { revealChart } from '@/lib/animation';

export function DashboardChart() {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const animation = revealChart(chartRef.current);
    return () => animation?.kill();
  }, []);

  return <div ref={chartRef}>{/* ApexChart */}</div>;
}
```

### React Spring Drawer (Form)

```tsx
import { animated, useDrawerSpring } from '@/lib/animation';

export function FormDrawer({ open }: { open: boolean }) {
  const style = useDrawerSpring(open, 'right');

  return (
    <animated.div style={style} className="fixed inset-y-0 right-0 w-96 bg-card">
      {/* Form content */}
    </animated.div>
  );
}
```

### Framer Motion Table Rows (Existing Pattern)

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { fadeSlideVariants } from '@/lib/animation';

export function DataTable({ rows }: { rows: Row[] }) {
  const shouldAnimate = rows.length <= 25;

  return (
    <AnimatePresence mode="popLayout">
      {rows.map(row => (
        <motion.tr
          key={row.id}
          variants={shouldAnimate ? fadeSlideVariants : undefined}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* cells */}
        </motion.tr>
      ))}
    </AnimatePresence>
  );
}
```

## Performance Constraints

Per `web-performance.md`:
- Animate compositor-friendly properties only (`transform`, `opacity`)
- Respect `prefers-reduced-motion` (all utils check this)
- Cap animations at 25 items for tables
- Dynamic import heavy libraries (GSAP, Spring)

## Bundle Impact

Before: ~280kb JS (Motion only)  
After: ~330kb JS (+GSAP +Spring, lazy-loaded)  
Anime.js deferred until v4 API documented.

## Next Steps

1. ✅ Utilities created for Motion, GSAP, Spring
2. ⏭️ Apply to 8 dashboard components (Phase 2)
3. ⏭️ Apply to 6 form components (Phase 3)
4. ⏭️ Update DataTable with GSAP stagger for 25+ rows (Phase 4)
5. ⏭️ Document Anime.js v4 patterns when stable

## Migration Priority

| Component | Current | Target | Library | Effort |
|-----------|---------|--------|---------|--------|
| ProductPerformance | Motion list | GSAP stagger | GSAP | Low |
| OutMaterialLineChart | Static | Scroll reveal | GSAP | Medium |
| OutSapForm | CSS transition | Spring drawer | React Spring | Low |
| DataTable (25+ rows) | Skip animation | GSAP stagger | GSAP | Medium |
| StockBalanceOverview | Static numbers | Counter animation | Framer Motion | Low |
| LoadingOverlay | CSS spinner | Anime spinner | Deferred | N/A |

---

**Status**: 3/4 libraries production-ready. Anime.js v4 API incompatible with v3 patterns — recommend sticking with Framer Motion for micro-interactions until Anime.js stabilizes or downgrade to v3.x.
