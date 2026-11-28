---
name: tailwind-v4
description: Standar penulisan Tailwind CSS v4 di MTMS — canonical spacing/sizing scale, z-index, CSS-first @theme tokens, gradient syntax (bg-linear-to-*), dan CSS variable shorthand (--var). Gunakan saat menulis atau mereview kelas Tailwind di komponen React/Next.js.
---

# Tailwind CSS v4 Conventions (MTMS)

MTMS menggunakan **Tailwind CSS v4** (`@import "tailwindcss";` + `@tailwindcss/postcss` di `src/app/css/globals.css`). Selalu gunakan **canonical classes** agar bebas dari warning `tailwindcss(suggestCanonicalClasses)` dan konsisten dengan token tema.

## 1. Canonical Spacing & Sizing Scale

Tailwind v4 mendukung skala numerik dinamis berbasis `0.25rem` (`4px` per 1 unit, termasuk kelipatan `.5` = `2px`):

| Jangan Gunakan (Non-Canonical) | Gunakan (Canonical Tailwind v4) | Nilai |
|---|---|---|
| `w-[200px]`, `min-w-[200px]`, `max-w-[200px]` | `w-50`, `min-w-50`, `max-w-50` | `200px` |
| `w-[180px]`, `w-[220px]`, `w-[260px]` | `w-45`, `w-55`, `w-65` | `180px`, `220px`, `260px` |
| `w-[70px]`, `w-[250px]`, `w-[270px]` | `w-17.5`, `w-62.5`, `w-67.5` | `70px`, `250px`, `270px` |
| `max-h-[300px]`, `max-h-[600px]` | `max-h-75`, `max-h-150` | `300px`, `600px` |
| `z-[1]`, `z-[50]`, `z-[60]` | `z-1`, `z-50`, `z-60` | `1`, `50`, `60` |

> **Rumus cepat**: `px / 4` (jika kelipatan `2px`, gunakan `.5`, misal `170px` → `42.5`). Hanya gunakan `[Npx]` bila angka ganjil/bukan kelipatan `2px` (misal `w-[165px]`, `p-[3px]`, `w-[375px]`).

## 2. Syntax Perubahan Tailwind v3 → v4

- **Gradient**: `bg-linear-to-r`, `bg-linear-to-br` (bukan `bg-gradient-to-*`).
- **Flex Shrink/Grow**: `shrink-0`, `grow` (bukan `flex-shrink-0`, `flex-grow`).
- **CSS Variables**: Gunakan tanda kurung `w-(--radix-popover-trigger-width)` atau `bg-(--my-var)`, bukan `w-[--radix-popover-trigger-width]`.
- **Important Modifier**: Di belakang class (`text-sm!`), bukan di depan (`!text-sm`).
- **Opacity Modifier**: `bg-primary/10`, `border-border/60` (standar v4).

## 3. Token Tema & Aksesibilitas Warna

- Gunakan token semantik dari `src/app/css/globals.css` (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-success`, `text-warning`, `text-destructive`).
- Jangan hardcode warna hex mentah di JSX.
- Pastikan kontras WCAG AA (≥ 4.5:1) pada mode terang dan gelap (`text-emerald-800 dark:text-emerald-400`, `text-blue-700 dark:text-blue-400`, `text-amber-800 dark:text-amber-400`).

## 4. Dokumentasi Resmi

Jika ragu dengan utility baru Tailwind v4, gunakan MCP `context7` (`resolve-library-id` → `tailwindcss`) sebelum menebak.
