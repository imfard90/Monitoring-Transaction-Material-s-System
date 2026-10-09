# MTMS Vibecoding — Best Practices Configuration

> **Applied:** 2026-10-09
> **Focus:** Quality, Performance, Consistency, Reusability, Data Accuracy

---

## 🎯 Core Principles Applied

### 1. Smart Planning Detection
**Rule:** Auto-detect complexity and choose appropriate flow

```
SIMPLE (Direct Implementation):
- UI tweaks (button, styling, text)
- Single file changes
- Bug fixes without business logic changes
→ Code immediately, no planning phase

COMPLEX (Plan First):
- Multi-file changes (>3 files)
- Database schema changes
- Business logic involving bispro.md rules
- New transaction types or status flows
→ Create plan, review, then implement
```

### 2. Code-First Response Style
**Rule:** Show code immediately, explain after

```
BEFORE (verbose):
"I'll implement this by creating a server action, 
then updating the UI component, and finally..."
[10 lines of explanation]
[code]

AFTER (vibecode):
[code immediately]

"✓ Added bulk approve:
  - Server action: bulk-approve-action.ts
  - UI: BulkApproveButton component
  - Types: InOutTagBulkApprove schema"
```

### 3. Full CRUD Boilerplate for New Pages
**Rule:** Generate complete, production-ready structure

**Why:** MTMS pages follow consistent patterns. Better to remove unused code than build from scratch.

**Generated Structure:**
```
src/app/(DashboardLayout)/apps/<page-name>/
├── page.tsx                 # Main page (Server Component)
├── _actions/
│   └── <page>-actions.ts   # Server actions (create, update, delete, list)
├── _components/
│   ├── <Page>Table.tsx     # Data table with TanStack Table
│   ├── <Page>Form.tsx      # Form with validation
│   ├── <Page>Filters.tsx   # Filter bar (date, status, search)
│   └── <Page>Actions.tsx   # Bulk actions toolbar
├── _types/
│   └── <page>.types.ts     # TypeScript interfaces
└── _lib/
    ├── schema.ts            # Zod validation schemas
    ├── columns.tsx          # Table column definitions
    └── utils.ts             # Page-specific utilities
```

### 4. Smart Quality Checks
**Rule:** Fast, non-blocking checks during development

```bash
# During development (fast, incremental)
pnpm tsc --noEmit --incremental --tsBuildInfoFile .cache/tsc.tsbuildinfo
pnpm dlx @biomejs/biome check --changed --write

# Pre-commit (full, blocking)
pnpm tsc --noEmit
pnpm dlx @biomejs/biome check --write .
```

### 5. Auto Code Review Before Commit
**Rule:** Every commit gets automatic review

**Flow:**
```
User: /commit "feat: add bulk approve"
  ↓
1. Run incremental tsc (10-15s)
2. Run Biome on changed files only (2-3s)
3. Auto code review (CRITICAL + HIGH issues only) (5-10s)
4. If clean → Stage + Commit + Push
5. If issues → Report + Block commit
```

### 6. Reusable Component Library
**Rule:** Always check for existing components before creating new ones

**MTMS Shared Components (MUST REUSE):**

```typescript
// Tables
import { DataTable } from '@/app/components/shared/DataTable'
import { DataTablePagination } from '@/app/components/shared/DataTablePagination'

// Forms
import { DateRangePicker } from '@/app/components/shared/DateRangePicker'
import { SearchableSelect } from '@/app/components/shared/SearchableSelect'

// UI Feedback
import { StatusBadge } from '@/app/components/shared/StatusBadge'
import { ConfirmDialog } from '@/app/components/shared/ConfirmDialog'
import { ModalDialog } from '@/app/components/shared/ModalDialog'

// Data Display
import { EmptyState } from '@/app/components/shared/EmptyState'
import { LoadingSkeleton } from '@/app/components/shared/LoadingSkeleton'
import { ErrorBoundary } from '@/app/components/shared/ErrorBoundary'
```

**Component Reuse Checklist:**
- [ ] Need table? → Use `DataTable` + TanStack Table
- [ ] Need date filter? → Use `DateRangePicker`
- [ ] Need status display? → Use `StatusBadge`
- [ ] Need confirmation? → Use `ConfirmDialog`
- [ ] Need modal? → Use `ModalDialog`
- [ ] Need dropdown with search? → Use `SearchableSelect`

### 7. Auto bispro.md Validation
**Rule:** Detect business rule violations during implementation

**Auto-Check Triggers:**
```
WHEN writing code that involves:
- Stock operations (add/subtract/transfer)
- Transaction status changes
- Warehouse operations
- Material movements

THEN automatically:
1. Read relevant section from bispro.md
2. Validate against business rules
3. Warn if violation detected
4. Suggest correct implementation
```

**Example:**
```typescript
// ❌ WRONG (Auto-detected violation)
await db.updateTable('stock_balance')
  .set({ qty: qty - requestQty })  // Missing internal WH check!
  .where('material_id', '=', materialId)
  .execute()

// Agent detects:
// ⚠️  BISPRO VIOLATION:
// Stock deduction requires checking if from_wh is internal.
// See bispro.md Section 2.1 - InOut Tag

// ✅ CORRECT (Auto-suggested)
const fromWh = await getWarehouse(fromWhId)
if (fromWh.branch === currentUserBranch) {
  // Internal WH - deduct stock
  await db.updateTable('stock_balance')
    .set({ qty: db.raw('qty - ?', [requestQty]) })
    .where('material_id', '=', materialId)
    .execute()
} else {
  // External WH - don't deduct, just log movement
  await db.insertInto('stock_movement')
    .values({
      type: 'transfer_out',
      notes: 'External WH - balance not tracked'
    })
    .execute()
}
```

### 8. Parallel Operations
**Rule:** Execute independent tasks in parallel

**Example: New Page Creation**
```
SEQUENTIAL (Old):
1. Create page.tsx (30s)
2. Create actions (30s)
3. Create types (15s)
4. Create components (45s)
5. Wire sidebar (10s)
Total: 130s

PARALLEL (New):
1. [Parallel] Create page + actions + types (45s)
2. [Parallel] Create components (45s)
3. [Sequential] Wire sidebar (10s)
4. [Sequential] Quality checks (20s)
Total: 75s (42% faster)
```

### 9. Data Accuracy Automation
**Rule:** Validate data integrity at every boundary

**Server Action Template with Auto-Validation:**
```typescript
import { z } from 'zod'

// 1. Define schema with business rules
const CreateInOutTagSchema = z.object({
  from_wh: z.string().uuid(),
  to_wh: z.string().uuid(),
  items: z.array(z.object({
    material_id: z.string().uuid(),
    qty_request: z.number().positive(),
  })).min(1),
}).refine(
  (data) => data.from_wh !== data.to_wh,
  { message: "From WH and To WH must be different" }
)

// 2. Server action with automatic validation
export async function createInOutTag(
  _state: unknown,
  formData: FormData
) {
  // Auto-parse and validate
  const parsed = CreateInOutTagSchema.safeParse({
    from_wh: formData.get('from_wh'),
    to_wh: formData.get('to_wh'),
    items: JSON.parse(String(formData.get('items'))),
  })

  // Auto-return validation errors
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  // Auto-check business rules from bispro.md
  const fromWh = await getWarehouse(parsed.data.from_wh)
  const toWh = await getWarehouse(parsed.data.to_wh)
  
  // Auto-validate stock availability for internal WH
  if (fromWh.branch === currentUserBranch) {
    for (const item of parsed.data.items) {
      const stock = await getStockBalance(item.material_id, fromWh.id)
      if (stock < item.qty_request) {
        return {
          success: false,
          error: `Insufficient stock for ${item.material_id}`,
        }
      }
    }
  }

  // Use stored procedure for transaction integrity
  await db.executeQuery(
    sql`SELECT sp_create_inout_tag(
      ${parsed.data.from_wh},
      ${parsed.data.to_wh},
      ${JSON.stringify(parsed.data.items)}
    )`
  )

  revalidatePath('/apps/inout-tag')
  return { success: true }
}
```

### 10. Consistent Structure Enforcement
**Rule:** Auto-apply MTMS conventions

**File Naming:**
- ✅ `kebab-case` for files: `inout-tag-actions.ts`
- ✅ `PascalCase` for components: `InOutTagTable`
- ✅ `camelCase` for functions: `createInOutTag`
- ✅ `SCREAMING_SNAKE_CASE` for constants: `MAX_ITEMS_PER_PAGE`

**Import Order (Auto-sorted by Biome):**
```typescript
// 1. React/Next.js
import { Suspense } from 'react'
import { redirect } from 'next/navigation'

// 2. External libraries
import { z } from 'zod'
import { format } from 'date-fns'

// 3. Internal absolute imports
import { db } from '@/lib/db'
import { DataTable } from '@/app/components/shared/DataTable'

// 4. Relative imports
import { createInOutTag } from './_actions/inout-tag-actions'
import type { InOutTag } from './_types/inout-tag.types'
```

**Component Structure:**
```typescript
// 1. Imports
// 2. Types
// 3. Constants
// 4. Component
// 5. Helper functions (if small, otherwise extract to utils.ts)
```

---

## 🔄 Refactoring Guidelines

### When to Refactor

**MUST refactor when:**
- [ ] Code duplicated 3+ times → Extract to shared utility
- [ ] Component >300 lines → Split into sub-components
- [ ] Function >50 lines → Break into smaller functions
- [ ] File >800 lines → Extract modules
- [ ] Same UI pattern in 3+ pages → Create reusable component

### Refactoring Checklist

**Before refactoring:**
1. [ ] Run `/review` to identify refactoring opportunities
2. [ ] Check for existing shared components/utils
3. [ ] Plan extraction (what to extract, where to put it)
4. [ ] Run tests to establish baseline

**During refactoring:**
1. [ ] Extract to shared location (`src/lib/utils/` or `src/app/components/shared/`)
2. [ ] Add TypeScript types
3. [ ] Add JSDoc comments
4. [ ] Update all call sites
5. [ ] Run `pnpm tsc --noEmit` after each step

**After refactoring:**
1. [ ] Run `/review` to verify quality
2. [ ] Run tests to verify behavior unchanged
3. [ ] Update documentation if needed
4. [ ] Commit with message: `refactor(scope): extract <what> to <where>`

---

## 📊 Performance Optimizations

### Database Queries

**MUST use:**
```typescript
// ✅ GOOD: Use stored procedures for complex transactions
await db.executeQuery(
  sql`SELECT sp_close_inout_tag(${tagId}, ${items})`
)

// ✅ GOOD: Use indexes for frequent queries
await db
  .selectFrom('inout_tag')
  .where('status', '=', 'REQUESTED')  // Indexed column
  .where('created_at', '>=', startDate)  // Indexed column
  .execute()

// ✅ GOOD: Batch operations
await db
  .insertInto('stock_movement')
  .values(movements)  // Insert all at once
  .execute()

// ❌ BAD: N+1 queries
for (const tag of tags) {
  const items = await getItems(tag.id)  // N queries!
}

// ✅ GOOD: Join or batch fetch
const tagsWithItems = await db
  .selectFrom('inout_tag')
  .leftJoin('inout_tag_items', 'inout_tag.id', 'inout_tag_items.tag_id')
  .execute()
```

### React Performance

**MUST apply:**
```typescript
// ✅ Server Components by default (no client JS)
export default async function InOutTagPage() {
  const tags = await getInOutTags()  // Fetch on server
  return <InOutTagTable data={tags} />
}

// ✅ Client Components only when needed
'use client'
export function InOutTagFilters({ onFilterChange }: Props) {
  const [filters, setFilters] = useState({})  // Interactive state
  return <FilterBar filters={filters} onChange={setFilters} />
}

// ✅ Memoize expensive computations
const sortedFilteredData = useMemo(
  () => data.filter(filter).sort(comparator),
  [data, filter, comparator]
)

// ✅ Debounce search inputs
const debouncedSearch = useDebounce(searchTerm, 300)
```

### Redis Caching

**MUST cache:**
```typescript
import { redis } from '@/lib/redis'

// ✅ Cache frequent queries (master data)
export async function getMaterials() {
  const cached = await redis.get('materials:all')
  if (cached) return JSON.parse(cached)

  const materials = await db
    .selectFrom('materials')
    .selectAll()
    .execute()

  await redis.set(
    'materials:all',
    JSON.stringify(materials),
    'EX',
    3600  // 1 hour TTL
  )

  return materials
}

// ✅ Invalidate on updates
export async function updateMaterial(id: string, data: MaterialUpdate) {
  await db.updateTable('materials')
    .set(data)
    .where('id', '=', id)
    .execute()

  // Invalidate cache
  await redis.del('materials:all')
  await redis.del(`material:${id}`)
}
```

---

## ✅ Quality Assurance Automation

### Pre-Commit Hooks

**Auto-run before every commit:**
```bash
#!/bin/bash
# .husky/pre-commit

echo "🔍 Running quality checks..."

# 1. Type check (fast, incremental)
pnpm tsc --noEmit --incremental || exit 1

# 2. Lint + format (auto-fix)
pnpm dlx @biomejs/biome check --write . || exit 1

# 3. Check for console.log
if git diff --cached | grep -E "console\.(log|debug|info)"; then
  echo "❌ Remove console.log statements"
  exit 1
fi

# 4. Check for TODO without ticket reference
if git diff --cached | grep -E "TODO(?! \[MTMS-\d+\])"; then
  echo "⚠️  TODOs should reference tickets: TODO [MTMS-123]"
  # Warning only, don't block
fi

echo "✅ Quality checks passed"
```

### Auto Code Review

**Integrated in /commit workflow:**
```
1. Detect changed files
2. Run focused review on changed code only
3. Check for:
   - CRITICAL: Security issues (SQL injection, XSS, auth bypass)
   - CRITICAL: bispro.md violations (stock logic, status flows)
   - HIGH: Logic errors (race conditions, null checks)
   - HIGH: Performance issues (N+1 queries, missing indexes)
4. Block commit if CRITICAL issues found
5. Warn for HIGH issues, allow commit with confirmation
```

---

## 🎯 Vibecoding Workflow Examples

### Example 1: Add Bulk Action (Simple)

**User:** "Add bulk approve to InOut Tag"

**Agent (vibecode mode):**
```typescript
// src/app/(DashboardLayout)/apps/inout-tag/_actions/bulk-actions.ts
export async function bulkApproveInOutTag(ids: string[]) {
  // Validation
  const schema = z.array(z.string().uuid()).min(1).max(100)
  const validIds = schema.parse(ids)

  // Check all tags are in correct status
  const tags = await db
    .selectFrom('inout_tag')
    .where('id', 'in', validIds)
    .where('status', '=', 'IN_TRANSIT')
    .select(['id'])
    .execute()

  if (tags.length !== validIds.length) {
    throw new Error('Some tags are not in IN_TRANSIT status')
  }

  // Use stored procedure for each (transaction-safe)
  const results = await Promise.all(
    tags.map(tag => 
      db.executeQuery(sql`SELECT sp_close_inout_tag(${tag.id})`)
    )
  )

  revalidatePath('/apps/inout-tag')
  return { success: true, count: results.length }
}

// src/app/(DashboardLayout)/apps/inout-tag/_components/BulkApproveButton.tsx
'use client'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { bulkApproveInOutTag } from '../_actions/bulk-actions'
import { toast } from 'sonner'

interface Props {
  selectedIds: string[]
  onSuccess: () => void
}

export function BulkApproveButton({ selectedIds, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()

  const handleApprove = () => {
    startTransition(async () => {
      try {
        const result = await bulkApproveInOutTag(selectedIds)
        toast.success(`${result.count} tags approved`)
        onSuccess()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed')
      }
    })
  }

  return (
    <Button 
      onClick={handleApprove}
      disabled={isPending || selectedIds.length === 0}
    >
      {isPending ? 'Approving...' : `Approve ${selectedIds.length} tags`}
    </Button>
  )
}
```

**✓ Added bulk approve:**
  - Server action: `bulk-actions.ts` with validation
  - UI: `BulkApproveButton` with loading state
  - Auto-revalidate on success
  - Toast notifications

---

### Example 2: New Transaction Type (Complex)

**User:** "Create new Material Adjustment transaction for stock opname"

**Agent (plan-first mode):**

**📋 Implementation Plan:**

**Phase 1: Database & Types** (bispro.md update needed)
1. Add `adjustment` to `enum_stock_movement`
2. Create `material_adjustment` table
3. Create stored procedure `sp_create_adjustment`
4. Update Kysely types

**Phase 2: Server Actions**
5. Create `_actions/adjustment-actions.ts`
   - `createAdjustment()`
   - `listAdjustments()`
   - `getAdjustmentDetails()`

**Phase 3: UI Components**
6. Create page: `/apps/material-adjustment/`
7. Create components:
   - `AdjustmentTable` (reuse DataTable)
   - `AdjustmentForm` (with reason validation)
   - `AdjustmentDetails` modal
8. Wire sidebar entry

**Phase 4: Validation & Testing**
9. Add Zod schemas with business rules
10. Test positive/negative adjustments
11. Verify stock_balance updates correctly
12. Run `/review` and `/security`

**Proceed with implementation? [yes/no/modify plan]**

---

## 🚀 Performance Targets

### Development Speed
- Simple feature (UI tweak): **< 2 min**
- Medium feature (new action): **< 10 min**
- Complex feature (new transaction): **< 30 min** (with plan)

### Code Quality
- TypeScript errors: **0** (enforced pre-commit)
- Biome issues: **0** (auto-fixed)
- Code review CRITICAL issues: **0** (blocking)
- Test coverage: **>80%** (target)

### Runtime Performance
- Page load (cold): **< 2s**
- Page load (cached): **< 500ms**
- Table render (1000 rows): **< 1s**
- Filter update: **< 200ms**
- Form submission: **< 1s**

---

## 📚 Documentation Updates

When you add/change code, auto-update:

1. **JSDoc comments** for exported functions
2. **README.md** if adding new major feature
3. **bispro.md** if changing business rules
4. **Type definitions** for public APIs

---

**Status:** ✅ Best practices configured and ready to apply
**Next:** Update workflows to enforce these practices
