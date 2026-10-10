# MTMS Architecture Improvement Plan

> **Date:** 2026-10-09
> **Based on:** Architecture Audit Report (78/100)
> **Target:** 90+/100 (Production Excellence)

---

## 🎯 Overview

MTMS memiliki fondasi yang solid. Plan ini fokus pada **4 area utama** untuk mencapai 90+/100:

1. **Standarisasi 4-Subdirectory Pattern** (semua 12 apps)
2. **Tambah 7 Missing Shared Components**
3. **Refactor Monolithic Components**
4. **Enforce Functional Programming & Stored Procedures**

---

## 📋 Phase 1: Foundation (Week 1)

### 🎯 Goal: Standarisasi struktur & tambah shared components

#### 1.1 Tambah 7 Missing Shared Components (4-6 hours)

**Lokasi:** `src/app/components/shared/`

| Component | Purpose | Priority |
|-----------|---------|----------|
| `EmptyState.tsx` | Empty data display | 🔴 HIGH |
| `LoadingSkeleton.tsx` | Loading placeholder | 🔴 HIGH |
| `ErrorBoundary.tsx` | Error handling wrapper | 🔴 HIGH |
| `FormField.tsx` | Label + Input + Error | 🟡 MED |
| `CurrencyInput.tsx` | Currency input dengan validasi | 🟡 MED |
| `QuantityInput.tsx` | Quantity input dengan stepper | 🟡 MED |
| `ToastHelper.ts` | Standardized toast utilities | 🟢 LOW |

**Template untuk semua components:**
```typescript
// src/app/components/shared/<Name>.tsx
'use client'  // Only if needed

import { cn } from '@/lib/utils'
import type { <Name>Props } from './<Name>.types'

export function <Name>({ ... }: <Name>Props) {
  // Pure component, no side effects
  return (...)
}
```

#### 1.2 Standarisasi 4-Subdirectory Pattern (2-3 hours/app)

**Template struktur untuk SEMUA apps:**
```
src/app/(DashboardLayout)/apps/<page>/
├── page.tsx                    # Server Component
├── _actions/                   # Server actions ⭐
│   ├── <page>-actions.ts       # Main CRUD
│   ├── bulk-actions.ts         # Bulk operations
│   └── index.ts                # Re-exports
├── _components/                # Client components ⭐
│   ├── <Page>Table.tsx         # Data table
│   ├── <Page>Form.tsx          # Form
│   ├── <Page>Filters.tsx       # Filter bar
│   ├── <Page>Actions.tsx       # Action toolbar
│   └── index.ts                # Re-exports
├── _types/                     # TypeScript types ⭐ NEW
│   ├── <page>.types.ts         # Main types
│   ├── forms.types.ts          # Form-specific types
│   └── index.ts                # Re-exports
└── _lib/                       # Utilities & schemas ⭐ NEW
    ├── schema.ts               # Zod validation
    ├── columns.tsx             # Table columns
    ├── utils.ts                # Page-specific utilities
    └── index.ts                # Re-exports
```

**Apps yang perlu di-refactor (12 total):**
- [ ] inout-tag
- [ ] out-material
- [ ] stock-movement
- [ ] rekon-lensa
- [ ] rekon-intech
- [ ] hasil-rekon
- [ ] out-sap
- [ ] out-lensa-ref
- [ ] wo-lensa-ref
- [ ] return-material
- [ ] user-profile
- [ ] auth/login

---

## 📋 Phase 2: Refactoring (Week 2)

### 🎯 Goal: Refactor monolithic components & improve FP

#### 2.1 Refactor Monolithic Components (6-8 hours)

**Priority Components:**

| Component | Size | Action |
|-----------|------|--------|
| `CreateTagModal.tsx` | 21KB | Split into 3-4 sub-components |
| `UpdateTagModal.tsx` | 13KB | Split into 2-3 sub-components |
| `InOutTagTable.tsx` | 13KB | Extract columns & filters |
| `RekonIntechForm.tsx` | 10KB+ | Split form sections |

**Refactoring Pattern:**

```typescript
// Before: Monolithic (21KB)
CreateTagModal.tsx
  ├── form state
  ├── validation
  ├── items table
  ├── submit handler
  └── UI rendering

// After: Modular (4-5 files, each <8KB)
_create-tag-modal/
├── index.tsx                    # Main modal (4KB)
├── tag-form-fields.tsx          # Form fields (5KB)
├── tag-items-table.tsx          # Items table (6KB)
├── tag-validation.ts            # Validation logic (2KB)
└── types.ts                     # Local types (1KB)
```

#### 2.2 Add Functional Programming Utilities (2-3 hours)

**Lokasi:** `src/lib/fp/`

**Files to create:**

```typescript
// src/lib/fp/composition.ts
export const pipe = <T>(...fns: Array<(arg: T) => T>) =>
  (value: T) => fns.reduce((acc, fn) => fn(acc), value)

export const compose = <T>(...fns: Array<(arg: T) => T>) =>
  (value: T) => fns.reduceRight((acc, fn) => fn(acc), value)

// src/lib/fp/hofs.ts
export const withValidation = <S extends z.ZodTypeAny, R>(
  schema: S,
  handler: (data: z.infer<S>) => Promise<R>
) => async (input: unknown): Promise<R> => {
  const parsed = schema.parse(input)
  return handler(parsed)
}

export const withAuth = <R>(
  handler: (user: SessionUser) => Promise<R>
) => async (): Promise<R> => {
  const user = await getSessionUser()
  if (!user) throw new Error('Unauthorized')
  return handler(user)
}

export const withErrorHandling = <T extends any[], R>(
  handler: (...args: T) => Promise<R>
) => async (...args: T): Promise<ApiResponse<R>> => {
  try {
    const data = await handler(...args)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) }
  }
}

// src/lib/fp/validators.ts
export const isValidTransition = <S extends string>(
  from: S, to: S, validMap: Record<S, S[]>
): boolean => validMap[from]?.includes(to) ?? false

export const isInternalWarehouse = (
  wh: Warehouse, currentBranch: string
): boolean => wh.branch === currentBranch
```

#### 2.3 Implement Repository Pattern (4-6 hours)

**Lokasi:** `src/lib/repositories/`

```typescript
// src/lib/repositories/inventory.repository.ts
export const createInventoryRepository = (db: Kysely<DB>) => ({
  // Stock operations
  getStockBalance: (whId: number, designatorId: number) =>
    db.selectFrom('inventory.stock_balance')
      .where('warehouse_id', '=', whId)
      .where('designator_id', '=', designatorId)
      .selectAll()
      .executeTakeFirst(),
  
  listStockByWarehouse: (whId: number) =>
    db.selectFrom('inventory.stock_balance')
      .innerJoin('master.designator', 'designator.id', 'stock_balance.designator_id')
      .where('stock_balance.warehouse_id', '=', whId)
      .selectAll()
      .execute(),
  
  // Transaction queries
  getInOutTagById: (id: number) =>
    db.selectFrom('inventory.inout_tag_header')
      .innerJoin('inventory.warehouse as fromWh', 'fromWh.id', 'inout_tag_header.from_warehouse_id')
      .innerJoin('inventory.warehouse as toWh', 'toWh.id', 'inout_tag_header.to_warehouse_id')
      .where('inout_tag_header.id', '=', id)
      .selectAll()
      .executeTakeFirst(),
  
  listInOutTags: (filters: InOutTagFilters) =>
    db.selectFrom('inventory.inout_tag_header')
      .where((eb) => eb.and([
        filters.status ? eb('status', '=', filters.status) : eb.val(true),
        filters.fromDate ? eb('created_at', '>=', filters.fromDate) : eb.val(true),
      ]))
      .selectAll()
      .execute(),
})
```

---

## 📋 Phase 3: Database Excellence (Week 3)

### 🎯 Goal: Prioritaskan stored procedures & business rules

#### 3.1 Standarisasi Stored Procedure Usage (8-10 hours)

**Rule:** SEMUA critical transactions WAJIB pakai stored procedures

**Migration Strategy:**

```typescript
// ❌ BEFORE: Direct queries dengan transaction
// in: return-material/_actions/return-actions.ts
await db.transaction().execute(async (trx) => {
  await trx.insertInto('inventory.return_material_header')...
  await trx.insertInto('inventory.return_material_item')...
  await trx.updateTable('inventory.stock_balance')...
})

// ✅ AFTER: Stored procedure (atomic, validated, audited)
// in: return-material/_actions/return-actions.ts
await sql`CALL inventory.sp_return_material(
  ${params.fromWhId}::integer,
  ${params.items}::jsonb,
  ${params.createdBy}::integer
)`.execute(db)
```

**Stored Procedures yang perlu dibuat (jika belum ada):**
- [ ] `sp_create_inout_tag` (✅ exists)
- [ ] `sp_update_inout_tag` (✅ exists)
- [ ] `sp_return_material` (✅ exists)
- [ ] `sp_record_material_used` (✅ exists)
- [ ] `sp_edit_transaction_used` (✅ exists)
- [ ] `sp_record_rekon_lensa_v2` (✅ exists)
- [ ] `sp_sap_out` (✅ exists)
- [ ] `sp_create_out_material` (❌ check)
- [ ] `sp_create_stock_movement` (❌ check)
- [ ] `sp_create_out_lensa_ref` (❌ check)
- [ ] `sp_create_wo_lensa_ref` (❌ check)

#### 3.2 Add Business Rules di Database (6-8 hours)

**SQL Constraints:**

```sql
-- Status transition constraints
ALTER TABLE inventory.inout_tag_header
ADD CONSTRAINT chk_inout_status CHECK (
  status IN ('OPEN', 'IN_TRANSIT', 'CLOSED', 'CANCEL')
);

-- Stock balance constraints
ALTER TABLE inventory.stock_balance
ADD CONSTRAINT chk_qty_positive CHECK (qty >= 0);

-- Audit trigger
CREATE TRIGGER trg_audit_inout_tag
AFTER INSERT OR UPDATE ON inventory.inout_tag_header
FOR EACH ROW EXECUTE FUNCTION inventory.fn_audit_trigger();
```

#### 3.3 Implement Optimistic Locking (3-4 hours)

```sql
-- Add version column
ALTER TABLE inventory.inout_tag_header
ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

```typescript
// Update with version check
await db.updateTable('inventory.inout_tag_header')
  .set({ ...data, version: (eb) => eb('version', '+', 1) })
  .where('id', '=', id)
  .where('version', '=', expectedVersion)
  .execute()
```

---

## 📋 Phase 4: Automation (Week 4)

### 🎯 Goal: Automated enforcement & validation

#### 4.1 Update Workflow Files (2-3 hours)

**Update `.cline/workflows/vibecode.md`:**

```markdown
## Auto-Detection Rules (UPDATED)

### Before Creating ANY New Component:
1. **CHECK SHARED COMPONENTS FIRST** (10+ components)
   - EmptyState, LoadingSkeleton, ErrorBoundary
   - FormField, CurrencyInput, QuantityInput
   - ToastHelper, etc.

2. **CHECK 4-SUBDIRECTORY PATTERN**
   - _actions/ for server actions
   - _components/ for client components
   - _types/ for TypeScript types
   - _lib/ for schemas & utilities

3. **USE STORED PROCEDURES** for critical transactions
   - DON'T use db.transaction().execute for inventory ops
   - ALWAYS use CALL sp_xxx for atomicity
```

**Update `VIBECODING_BEST_PRACTICES.md`:**

```markdown
## Architecture Standards (NEW)

### 1. Functional Programming
- Pure functions for business logic
- Composition via pipe/compose
- Higher-order functions for validation
- Repository pattern for data access

### 2. Reusable Components (10+ standard)
- Always check before creating
- Composition over duplication

### 3. 4-Subdirectory Pattern
- _actions/, _components/, _types/, _lib/
- Consistent across all apps

### 4. Database-Driven Business Rules
- Stored procedures for critical ops (PRIORITY)
- DB constraints for data integrity
- Audit triggers for compliance

### 5. Atomic Transactions
- Stored procedures guarantee atomicity
- Optimistic locking for concurrency
- Compensation pattern for rollback
```

#### 4.2 Add Automated Checks (4-6 hours)

**ESLint Rules:**

```json
// .eslintrc.json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.object.property.name='transaction']",
        "message": "Use stored procedures (CALL sp_xxx) for inventory transactions"
      }
    ]
  }
}
```

**Pre-commit Hook:**

```bash
#!/bin/bash
# .husky/pre-commit

# Check 4-subdirectory pattern
for dir in src/app/\(DashboardLayout\)/apps/*/; do
  if [ ! -d "$dir/_actions" ] || [ ! -d "$dir/_components" ]; then
    echo "❌ Missing _actions or _components in $dir"
    exit 1
  fi
done

# Check for direct DB transactions in inventory apps
if grep -r "db.transaction().execute" src/app/\(DashboardLayout\)/apps/inout-tag/ 2>/dev/null; then
  echo "❌ Use stored procedures for inventory transactions"
  exit 1
fi
```

---

## 📊 Success Metrics

### After Phase 1 (Week 1)
- ✅ 17+ shared components (10 existing + 7 new)
- ✅ All 12 apps follow 4-subdirectory pattern
- ✅ TypeScript types centralized

### After Phase 2 (Week 2)
- ✅ No monolithic components >10KB
- ✅ FP utilities available
- ✅ Repository pattern implemented

### After Phase 3 (Week 3)
- ✅ 100% critical transactions use stored procedures
- ✅ DB constraints for all business rules
- ✅ Optimistic locking implemented

### After Phase 4 (Week 4)
- ✅ Workflows enforce all standards
- ✅ Automated checks prevent violations
- ✅ Score: 90+/100

---

## 🎯 Summary

**Total estimated time: 45-65 hours** (2-3 weeks untuk 1 developer)

**Phases:**
1. **Foundation** (Week 1): Shared components + 4-subdir pattern
2. **Refactoring** (Week 2): Monolithic components + FP utilities
3. **Database Excellence** (Week 3): Stored procedures + constraints
4. **Automation** (Week 4): Workflows + automated checks

**Expected outcome:**
- Score: 78/100 → **90+/100**
- All 12 apps consistent
- Production-ready architecture
- Maintainable, scalable, type-safe

---

**Plan created:** 2026-10-09
**By:** Kiro AI
**For:** MTMS Project
**Priority:** HIGH (recommended to start Phase 1 immediately)
