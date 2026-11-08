# MTMS Animation System

Centralized animation utilities for consistent, accessible motion across the application.

## Components

### 1. **Stagger Animations** (`lib/animation/stagger.ts`)

Progressive disclosure for lists and grids.

```tsx
import { motion } from 'framer-motion';
import { staggerContainer, staggerItemVariants } from '@/lib/animation/stagger';

<motion.div variants={staggerContainer} initial="hidden" animate="show">
  {items.map((item) => (
    <motion.div key={item.id} variants={staggerItemVariants}>
      <Card>{item.content}</Card>
    </motion.div>
  ))}
</motion.div>
```

**Timing:**
- Stagger delay: 80ms
- Initial delay: 40ms
- Spring physics: `stiffness: 300`, `damping: 24`, `mass: 0.8`

**Convenience Components:**
- `<StaggerContainer>` / `<StaggerItem>` in `src/components/ui/motion/`
- Used in dashboard grid layout

### 2. **Chart Animations** (`lib/chart-colors.ts`)

ApexCharts reveal animations via `getApexBaseOptions()`.

```tsx
const options = {
  ...getApexBaseOptions(),
  chart: { type: 'line' },
  series: [...],
};
```

**Timing:**
- Entrance: 800ms (`easeinout`)
- Gradual delay: 120ms (progressive data disclosure)
- Dynamic updates: 350ms

**Accessibility:**
- Respects `prefers-reduced-motion` (disables when set)

### 3. **Page Transitions** (`lib/animation/page-transition.ts`)

View Transitions API for route changes.

```tsx
import { useRouter } from 'next/navigation';
import { transitionNavigate } from '@/lib/animation/page-transition';

const router = useRouter();
await transitionNavigate(() => router.push('/dashboard'));
```

**Fallback:**
- Instant navigation when API unavailable or `prefers-reduced-motion` is set

**CSS:**
- Defined in `src/app/css/globals.css` (300ms cross-fade, `cubic-bezier(0.16, 1, 0.3, 1)`)

### 4. **Theme Transitions**

Smooth theme switching (Header.tsx).

```tsx
// Uses View Transitions API automatically
const toggleMode = () => setTheme(theme === 'light' ? 'dark' : 'light');
```

**Implementation:**
- `Header.tsx` wraps `setTheme()` in `document.startViewTransition()`
- CSS in `globals.css` (300ms cross-fade)

## Accessibility

All animations respect `prefers-reduced-motion`:

- **Stagger**: Uses CSS `motion-reduce:transition-none` on parent containers
- **Charts**: `getApexBaseOptions()` checks media query, disables when set
- **Page transitions**: Falls back to instant navigation
- **Theme toggle**: Falls back to instant update

## Performance

- **Stagger**: Compositor-only properties (`opacity`, `transform`)
- **Charts**: ApexCharts internal optimization (canvas rendering)
- **Page transitions**: Browser-native View Transitions API (GPU-accelerated)
- **Bundle cost**: 0 bytes (Framer Motion already installed, View Transitions API native)

## Timing Reference

| Animation | Duration | Easing | Stagger | Notes |
|-----------|----------|--------|---------|-------|
| Stagger entrance | ~200ms | Spring (300/24/0.8) | 80ms | Card/list reveals |
| Chart reveal | 800ms | `easeinout` | 120ms | Progressive data |
| Page transition | 300ms | `cubic-bezier(0.16,1,0.3,1)` | N/A | Route changes |
| Theme toggle | 300ms | `cubic-bezier(0.16,1,0.3,1)` | N/A | Light/dark switch |

## Design Tokens

All timing and easing values are centralized in animation utilities. Update in one place:

- **Stagger**: `src/lib/animation/stagger.ts`
- **Charts**: `src/lib/chart-colors.ts` (`getApexBaseOptions()`)
- **Transitions**: `src/app/css/globals.css` (View Transitions block)
