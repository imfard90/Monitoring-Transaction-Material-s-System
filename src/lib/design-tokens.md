# MTMS Design Tokens

## Typography Scale

### Hierarchy

```typescript
// Display (Hero sections, landing pages)
display-2xl: 'text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight'
display-xl: 'text-4xl md:text-5xl font-bold leading-tight tracking-tight'
display-lg: 'text-3xl md:text-4xl font-bold leading-tight tracking-tight'

// Headings (Page/section titles)
h1: 'text-3xl font-bold leading-tight tracking-tight'
h2: 'text-2xl font-semibold leading-snug tracking-tight'
h3: 'text-xl font-semibold leading-snug tracking-tight'
h4: 'text-lg font-semibold leading-normal tracking-tight'
h5: 'text-base font-semibold leading-normal'

// Body
body-lg: 'text-lg leading-relaxed'
body: 'text-base leading-relaxed'
body-sm: 'text-sm leading-relaxed'

// UI Elements
label: 'text-sm font-semibold leading-none'
button: 'text-sm font-medium'
badge: 'text-xs font-medium'
caption: 'text-xs leading-normal text-muted-foreground'
tooltip: 'text-xs leading-snug'

// Code/Monospace
code: 'text-sm font-mono'
```

### Leading (Line Height)

- `leading-none` (1.0): Titles, labels (tight vertical rhythm)
- `leading-tight` (1.25): Large headings
- `leading-snug` (1.375): Medium headings
- `leading-normal` (1.5): Small headings, UI text
- `leading-relaxed` (1.625): Body text (optimal readability)

### Tracking (Letter Spacing)

- `tracking-tight` (-0.025em): Display & headings (optical balance)
- `tracking-normal` (0em): Body text
- `tracking-wide` (0.025em): Uppercase labels

### Font Weight

- `font-normal` (400): Body, captions
- `font-medium` (500): Buttons, tabs, secondary emphasis
- `font-semibold` (600): Labels, headings h2-h5, card titles
- `font-bold` (700): h1, display text

## Shadow Scale

```typescript
shadow-xs: 'shadow-[0_1px_2px_0_rgb(0_0_0_/_0.05)]'
shadow-sm: 'shadow-[0_1px_3px_0_rgb(0_0_0_/_0.1),_0_1px_2px_-1px_rgb(0_0_0_/_0.1)]'
shadow-md: 'shadow-[0_4px_6px_-1px_rgb(0_0_0_/_0.1),_0_2px_4px_-2px_rgb(0_0_0_/_0.1)]'
shadow-lg: 'shadow-[0_10px_15px_-3px_rgb(0_0_0_/_0.1),_0_4px_6px_-4px_rgb(0_0_0_/_0.1)]'
shadow-xl: 'shadow-[0_20px_25px_-5px_rgb(0_0_0_/_0.1),_0_8px_10px_-6px_rgb(0_0_0_/_0.1)]'
shadow-2xl: 'shadow-[0_25px_50px_-12px_rgb(0_0_0_/_0.25)]'
```

### Usage

- `shadow-xs`: Resting cards, subtle elevation
- `shadow-sm`: Hovered cards, buttons
- `shadow-md`: Elevated buttons, dropdown menus
- `shadow-lg`: Popovers, floating panels
- `shadow-xl`: Sheets, drawers
- `shadow-2xl`: Modals, dialogs

## Color Semantic

```typescript
// Status colors (already in theme)
success: 'oklch(0.65 0.18 142)'   // Green
warning: 'oklch(0.75 0.15 85)'    // Amber
error: 'oklch(0.58 0.22 25)'      // Red
info: 'oklch(0.55 0.20 250)'      // Blue

// Usage patterns
bg-{status}/10 text-{status} border-{status}/20  // Soft badges
bg-{status} text-white                            // Solid buttons
text-{status}                                     // Inline emphasis
```

## Border Radius

```typescript
rounded-xs: '0.25rem'   // 4px - tight UI elements
rounded-sm: '0.375rem'  // 6px - buttons, inputs
rounded-md: '0.5rem'    // 8px - cards (legacy, prefer rounded-xl)
rounded-lg: '0.75rem'   // 12px - panels
rounded-xl: '1rem'      // 16px - cards, modals (MTMS default)
rounded-2xl: '1.5rem'   // 24px - hero sections
rounded-full: '9999px'  // Circles, pills
```

## Spacing Scale (Tailwind default, document usage)

```typescript
gap-2: '0.5rem'   // Tight icon+text
gap-3: '0.75rem'  // Form elements
gap-4: '1rem'     // Card content
gap-6: '1.5rem'   // Section spacing

p-3: '0.75rem'    // Compact padding
p-4: '1rem'       // Standard padding
p-5: '1.25rem'    // Card padding (current)
p-6: '1.5rem'     // Modal padding
```
