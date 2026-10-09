---
description: "Scaffold a new MTMS dashboard page and wire it into the sidebar"
argument-hint: "<page-name> [description]"
---

# New Page Workflow

> Loads `mtms-create-page` skill automatically. Follow its workflow exactly.

1. Parse arguments:
   - First word = page slug (kebab-case), e.g. `stock-report`
   - Remaining words = brief description of the page purpose

2. Load `mtms-create-page` skill — it defines the exact file structure and sidebar wiring steps for MTMS.

3. Before creating any files, read `bispro.md` if the page involves:
   - Inventory, stock, transactions, materials, warehouse, or technician data

4. Check existing shared components BEFORE building custom UI:
   - `src/app/components/shared/DataTable.tsx`
   - `src/app/components/shared/DataTablePagination.tsx`
   - `src/app/components/shared/DateRangePicker.tsx`
   - `src/app/components/shared/StatusBadge.tsx`
   - `src/app/components/shared/ModalDialog.tsx`
   - `src/app/components/shared/ConfirmDialog.tsx`
   - `src/app/components/shared/SearchableSelect.tsx`

5. Scaffold the page following MTMS conventions:
   - Route: `src/app/(DashboardLayout)/apps/<page-slug>/page.tsx`
   - Server Action: `src/app/(DashboardLayout)/apps/<page-slug>/_actions/<page-slug>-actions.ts`
   - Components: `src/app/(DashboardLayout)/apps/<page-slug>/_components/`
   - Use Server Actions (not TanStack Query) unless the page needs real-time polling or infinite scroll

6. Wire sidebar: add entry to `src/app/(DashboardLayout)/layout/sidebar/sidebaritems.ts`

7. Run quality checks:
   ```bash
   pnpm tsc --noEmit
   pnpm dlx @biomejs/biome check --write .
   ```
