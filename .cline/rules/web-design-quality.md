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

## Motion & Interaction Quality

- Motion must clarify state, guide attention, or preserve spatial continuity. Remove decorative motion.
- Prioritize immediate response and operational readability; avoid delayed entrances, parallax, looping decoration, or animation that obscures transaction data.
- Prefer CSS for simple transitions; use the installed motion library only when coordinated React interactions justify it. Do not add a second animation runtime for a reference pattern.
- Prefer `transform` and `opacity`, respect `prefers-reduced-motion`, and provide an understandable static state.
- Keep controls usable by keyboard and touch without motion or gestures as the only affordance.
- Animate meaningful changes only; avoid animating every table row, metric refresh, validation message, or navigation element by default.

## Inspiration References (Use Principles, Not Blind Imports)

External libraries are visual/interaction references, not automatic dependencies or design authority:

- Study sequencing and timelines from anime.js, but use CSS for simple transitions and add a timeline engine only for a demonstrated orchestration need.
- Use Motion (motion.dev) as a reference for state-driven animation; follow the installed Motion-compatible stack and do not add a second runtime.
- Borrow interaction ideas from Kokonut UI; rebuild useful behavior with existing MTMS primitives and tokens rather than copying styles wholesale.
- Verify a specific Backlit UI component and its current implementation before using it as a reference; do not infer APIs from its name.

Adapt borrowed patterns to MTMS operations, accessibility, dark theme, and design tokens. Review licensing and attribution before copying assets or substantial code. References do not override `AGENTS.md` or authorize new packages.

## Component Checklist

- [ ] Does it avoid looking like a default Tailwind or shadcn template?
- [ ] Does it have intentional hover/focus/active states?
- [ ] Does it use hierarchy rather than uniform emphasis?
- [ ] Would this look believable in a real product screenshot?
- [ ] If it supports both themes, do both light and dark feel intentional?
