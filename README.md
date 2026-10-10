# Monitoring Transaction Material's System (MTMS)

Next.js + TypeScript app for material transaction monitoring (mutasi stok, rekon Intech/Lensa, return, dashboard, scraper Lensa).

## Project Docs

- [AGENTS.md](./AGENTS.md) — binding work conventions for all agents (human/AI).
- [Audit Report](./docs/AUDIT_REPORT.md) — source audit findings + prioritized improvement tasks.

Every contributor MUST read AGENTS.md before changing code. Audit findings drive priority of fixes (P0→P3).

## Getting Started

First, run development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with browser see result.

## Scripts

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm check` — biome check
- `pnpm lint` — biome lint
- `pnpm format` — biome format

## Project Structure

- `src/app/(DashboardLayout)/apps/*` — feature modules (inout-tag, out-sap, rekon-*, return-material, hasil-rekon, wo-lensa, stock-movement).
- `src/app/(DashboardLayout)/_actions/*` — server actions per feature.
- `src/lib/db/` — Kysely client + migrations.
- `src/lib/repositories/` — data access (SP wrappers).
- `src/lib/security/` — idempotency + rate limiting.
- `src/lib/auth-server.ts` — session helpers.
- `docs/AUDIT_REPORT.md` — audit + task list.

## Deploy

Lihat [Next.js deployment documentation](https://nextjs.org/docs/deployment).
