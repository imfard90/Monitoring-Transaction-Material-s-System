---
description: "React/Next.js performance audit on component or page"
argument-hint: "[component-file-path]"
---

# Performance Audit Workflow

1. Determine target:
   - If argument provided: audit specified component/page file
   - Otherwise: audit most recently modified `.tsx` file (`git diff --name-only HEAD | grep .tsx | head -1`)

2. Load `react-performance` skill. Audit target across all 8 priority categories:

   **P1 — Waterfalls**
   - Sequential data fetches that could be parallelized with `Promise.all`
   - Client-side fetches that should be Server Actions
   - Missing `Suspense` boundaries causing full-page blocking

   **P2 — Bundle Size**
   - Heavy imports not using dynamic `import()`
   - Icons imported from full libraries instead of individual icons (Iconify is OK)
   - Missing `next/dynamic` for large Client Components

   **P3 — Server-Side**
   - Data fetched client-side that could be Server Component
   - Missing `generateStaticParams` for static routes
   - Unnecessary `"use client"` directives

   **P4 — Client Fetching**
   - TanStack Query used where Server Action suffices
   - Missing `staleTime` / `gcTime` on TanStack Query

   **P5 — Re-renders**
   - Missing `React.memo` on expensive pure components
   - Inline object/array literals in props or deps
   - Context value not memoized

   **P6 — Images & Assets**
   - `<img>` instead of `next/image`
   - Missing width/height on images
   - Unoptimized assets

   **P7 — Animations**
   - CSS animations on layout properties (width, height, top, left)
   - Should use `transform` and `opacity`
   - Framer Motion `layout` animations used unnecessarily

   **P8 — Network**
   - No caching headers on API routes
   - Missing `revalidate` on Server Actions
   - Redis cache not utilized for expensive queries

3. Report findings:
   ```
   ## Performance Audit: [file]
   
   ### P1 — Waterfalls
   [issues or ✓ OK]
   
   ### P2 — Bundle Size
   [issues or ✓ OK]
   
   ... (continue for each category)
   
   ## Summary
   Total issues: X
   Estimated impact: [High/Medium/Low]
   
   ## Recommendations
   [prioritized fixes]
   ```

4. Suggest concrete fixes with code examples
