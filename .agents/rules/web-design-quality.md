---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> This file extends [common/patterns.md](common-patterns.md) with web-specific design-quality guidance.

# Web Design Quality Standards

## Anti-Template Policy

Do not ship generic template-looking UI. Frontend output should look intentional, opinionated, and specific to the product.

### Banned Patterns

- Default card grids with uniform spacing and no hierarchy
- Stock hero section with centered headline, gradient blob, and generic CTA
- Unmodified library defaults passed off as finished design
- Flat layouts with no layering, depth, or motion
- Uniform radius, spacing, and shadows across every component
- Safe gray-on-white styling with one decorative accent color
- Dashboard-by-numbers layouts with sidebar + cards + charts and no point of view
- Default font stacks used without a deliberate reason

### Required Qualities

Every meaningful frontend surface should demonstrate at least four of these:

1. Clear hierarchy through scale contrast
2. Intentional rhythm in spacing, not uniform padding everywhere
3. Depth or layering through overlap, shadows, surfaces, or motion
4. Typography with character and a real pairing strategy
5. Color used semantically, not just decoratively
6. Hover, focus, and active states that feel designed
7. Grid-breaking editorial or bento composition where appropriate
8. Texture, grain, or atmosphere when it fits the visual direction
9. Motion that clarifies flow instead of distracting from it
10. Data visualization treated as part of the design system, not an afterthought

## Before Writing Frontend Code

1. Pick a specific style direction. Avoid vague defaults like "clean minimal".
2. Define a palette intentionally.
3. Choose typography deliberately.
4. Gather at least a small set of real references.
5. Use ECC design/frontend skills where relevant.

## Worthwhile Style Directions

- Editorial / magazine
- Neo-brutalism
- Glassmorphism with real depth
- Dark luxury or light luxury with disciplined contrast
- Bento layouts
- Scrollytelling
- 3D integration
- Swiss / International
- Retro-futurism

Do not default to dark mode automatically. Choose the visual direction the product actually wants.

## Inspiration References (Use Principles, Not Blind Imports)

Use external libraries as visual/interaction references, not as automatic dependencies or design authority:

- **anime.js** — study sequencing, stagger, timelines, and SVG/DOM motion to communicate a deliberate sequence. Prefer CSS for simple transitions; use JavaScript animation only when sequencing or orchestration adds clear value.
- **Motion (motion.dev)** — reference state-driven React animation, presence/exit, layout continuity, and scroll-linked patterns. In this codebase use the installed Motion-compatible stack and local motion guidance; do not add a second animation runtime.
- **Kokonut UI** — borrow its interaction-first component studies, live demos, tactile controls, and composed shadcn-style patterns. Rebuild only the useful behavior with existing MTMS primitives/tokens; do not copy its styling wholesale.
- **Backlit UI** — treat as a visual reference only after verifying a specific component/source and its current implementation. Do not infer its API or dependency assumptions from its name; links/content may change.

For every borrowed pattern, identify the user need it serves, adapt it to MTMS's operational context, accessibility, dark theme, and design tokens, and review licensing/attribution before copying source assets or substantial code. References do not override `AGENTS.md` or authorize new packages.

## Motion & Interaction Quality

- Motion must clarify state, guide attention, or preserve spatial continuity. If it is merely decorative, remove it.
- Prioritize immediate response and operational readability over spectacle; avoid delayed entrances, parallax, looping decoration, and animation that obscures transaction data.
- Use the least complex mechanism that fits: CSS transitions for simple hover/focus/state changes; the existing motion library for coordinated React presence/layout/gesture interactions; reserve timeline engines such as anime.js for a demonstrated orchestration need.
- Prefer `transform` and `opacity`; do not animate layout-bound properties for routine UI. Respect `prefers-reduced-motion`, disable non-essential movement, and keep an understandable static state.
- Make controls usable by keyboard and touch without motion/gesture being the only affordance. Preserve focus visibility and avoid focus being obscured by overlays or transitions.
- Animate only meaningful changes; do not animate every table row, metric refresh, validation message, or navigation element by default.

## Component Checklist

- [ ] Does it avoid looking like a default Tailwind or shadcn template?
- [ ] Does it have intentional hover/focus/active/disabled states?
- [ ] Does it use hierarchy rather than uniform emphasis?
- [ ] Would this look believable in a real product screenshot?
- [ ] If it supports both themes, do both light and dark feel intentional?
- [ ] Does each animation serve a stated interaction purpose and preserve responsive input?
- [ ] Does reduced-motion preference provide a clear, non-motion experience?
- [ ] Are all interactions available by keyboard/touch without relying on animation or gesture alone?
