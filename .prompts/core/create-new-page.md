# Task: Add a new blank page

Create a **blank** page (heading + breadcrumbs only, no other content) and wire it into the sidebar. Follow `AGENTS.md` strictly. Three steps — do them in order.

---

## Step 0 — Gather inputs (ask before doing anything)

Ask for all four; do NOT proceed until answered:

1. **Page label** — sidebar text (e.g. `Reports`)
2. **Page path** — URL path (e.g. `reports` resulting in `/reports`)
3. **Sidebar heading/section** — e.g. `Home`, `Apps`, `Pages`, or ask if new.
4. **Nav group** — existing group or NEW standalone.
   Child of existing group → sub-item. NEW standalone → top-level item with its own icon.

---

## Step 1 — Create `page.tsx`

Route placement inside `(DashboardLayout)`:

| Type                    | Folder                                          |
| ----------------------- | ----------------------------------------------- |
| Feature / App           | `src/app/(DashboardLayout)/apps/<route>/`       |
| Shared UI / Component   | `src/app/(DashboardLayout)/ui-elements/<route>/`|
| Standalone Page         | `src/app/(DashboardLayout)/<route>/`            |

`<route>` = `[PAGE_PATH]` without the leading slash.

**Template** (matches MTMS standard layout):

```tsx
import BreadcrumbComp from '@/app/(DashboardLayout)/layout/shared/breadcrumb/BreadcrumbComp';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '[PAGE_LABEL]',
};

const [PageName]Page = () => {
  return (
    <>
      <BreadcrumbComp 
        title="[PAGE_LABEL]" 
        items={[
          { title: 'Home', to: '/' }, 
          { title: '[PAGE_LABEL]' }
        ]} 
      />
      {/* Page Content */}
      <div className="mt-6">
        {/* Replace with actual content / card */}
      </div>
    </>
  );
};

export default [PageName]Page;
```

Rules:
- **Server Components Default**: Keep the page as a Server Component. Do not use `"use client"` here unless strictly necessary.
- **Data Fetching**: Use Server Actions (`"use server"`) for standard data fetching and mutations. Use TanStack Query only for complex interactive Client Components.
- **Modular Components**: Do not build a monolithic page. Extract sections into focused sub-components.
- **UI Primitives**: Prefer `shadcn/ui` primitives (`src/components/ui/`) over raw HTML.
- **Naming**: `[PageName]` = `[PAGE_LABEL]` in PascalCase (e.g. `Reports` → `ReportsPage`).
- Do NOT touch the sidebar in this file.

---

## Step 2 — Wire the sidebar

Edit `src/app/(DashboardLayout)/layout/sidebar/sidebaritems.ts` (`SidebarContent`):

- **Child of existing group** (new icon: NO): add `{ name: "[PAGE_LABEL]", url: "/[PAGE_PATH]" }` to that group's `children` array.
- **New top-level item** (new icon: YES): add `{ name: "[PAGE_LABEL]", url: "/[PAGE_PATH]", icon: "[icon-name]", id: uniqueId() }` under the correct `heading`. Icon name should be an Iconify string like `solar:widget-2-linear` (match existing conventions).

`url` must match `/[PAGE_PATH]` exactly.

---

## Step 3 — Verify

1. `pnpm check` (Biome linting/formatting) passes.
2. `pnpm run build` passes with no errors.
3. `pnpm run dev`: page renders at `/[PAGE_PATH]` showing only the breadcrumb header; sidebar shows `[PAGE_LABEL]` under the correct section/group; active state highlights.
