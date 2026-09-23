# MTMS — Tech Stack

## Core Framework

- **Next.js 16** — App Router with Server Actions architecture
- **React 19** — `react ^19.x`
- **TypeScript** — strict mode

## Architecture

- **Server Actions** — default for standard pages (Dashboard, Form Submit, CRUD)
- **TanStack Query** — for interactive Client Components (infinite scroll, real-time polling, dynamic filter/search/table without page reload)

## Styling

- **Tailwind CSS 4** — with CSS variables as semantic design tokens
- **Framer Motion** — animations and transitions

## Authentication

- **Better Auth** — authentication & session management

## UI Component Library

- **shadcn/ui** — component primitives (New York style)
- **Radix UI** — underlying accessible primitives
- **CVA** (`class-variance-authority`) — component variant definitions
- **clsx** + **tailwind-merge** — utility class composition via `cn()`

## Icons

- **Iconify** (`@iconify/react`) — primary icon library

## Data Tables

- **TanStack Table** (`@tanstack/react-table`) — sorting, filtering, pagination

## Database

- **PostgreSQL 18** — primary database
- **pg Pool** — connection pooling
- **Kysely** — type-safe SQL query builder

## Validation

- **Zod** — schema validation (forms, API inputs, server actions)

## Notifications

- **Sonner** — toast notifications

## Utilities

- **date-fns** — date manipulation and formatting

## Theming

- **next-themes** — dark/light mode toggle

## PWA / Service Worker

- **Serwist** (`@serwist/turbopack`) — PWA support with Turbopack-compatible service worker

## Code Quality

- **Biome** — linting, formatting, import sorting (`biome.json`)

## Package Manager

- **pnpm**