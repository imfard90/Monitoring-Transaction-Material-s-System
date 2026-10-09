---
description: "Scaffold full CRUD page with production-ready boilerplate"
argument-hint: "<page-name> [description]"
---

# New Page Workflow (Full CRUD)

> **Generates:** Complete production-ready page with all MTMS conventions

## Parse Arguments

- **First word:** page slug (kebab-case), e.g. `material-request`
- **Remaining words:** brief description, e.g. "Material request management"

## Pre-Generation Checks

### 1. Business Rules Check

**If page involves:**
- `stock`, `inventory`, `warehouse`, `transaction`, `material`, `technician`

**Then:** Read relevant sections from `bispro.md`.

### 2. Reusable Components Check

**Always check BEFORE generating custom UI:**
- DataTable, DateRangePicker, StatusBadge
- ModalDialog, ConfirmDialog, SearchableSelect
- EmptyState, LoadingSkeleton, ErrorBoundary

## Generated Structure

```
src/app/(DashboardLayout)/apps/<page-name>/
├── page.tsx                    # Server Component
├── _actions/
│   ├── <page>-actions.ts       # CRUD operations
│   └── bulk-actions.ts         # Bulk operations
├── _components/
│   ├── <Page>Table.tsx         # Data table
│   ├── <Page>Form.tsx          # Create/Edit form
│   ├── <Page>Filters.tsx       # Filter bar
│   └── <Page>Actions.tsx       # Bulk actions
├── _types/
│   └── <page>.types.ts         # TypeScript types
└── _lib/
    ├── schema.ts               # Zod validation
    ├── columns.tsx             # Table columns
    └── utils.ts                # Utilities
```

## Wire Sidebar

Add entry to `src/app/(DashboardLayout)/layout/sidebar/sidebaritems.ts`

## Run Quality Checks

```bash
# Incremental type check
pnpm tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo

# Lint + format
pnpm dlx @biomejs/biome check --write .
```

## Summary Report

```
✅ New Page Created: [Page Name]

📁 Generated Files: 9-12 files
🔗 Sidebar: Wired
✓ TypeScript: 0 errors
✓ Biome: 0 issues
✓ Reused: DataTable, StatusBadge, etc.

🚀 Page ready at: /apps/<page>
```

## Performance Target

**Full CRUD generation:** < 60 seconds
