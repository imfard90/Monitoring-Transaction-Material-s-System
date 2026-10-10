# MTMS Architecture Audit Report

> **Date:** 2026-10-09
> **Auditor:** Kiro AI
> **Scope:** Functional Programming, Reusable Components, Modular Architecture, Database-Driven Business Rules, Atomic Transactions (Stored Procedures Priority)
> **Verdict:** ⚠️ **GOOD (78/100)** — Foundation strong, perlu refinement

---

## 📊 Executive Summary

MTMS sudah memiliki **fondasi arsitektur yang solid** dengan:
- ✅ 10 shared components aktif dan di-reuse di 5+ apps
- ✅ 9+ stored procedures untuk transaksi inventory
- ✅ DB transactions digunakan untuk atomicity
- ✅ Modular structure dengan `_actions/` dan `_components/`

**Temuan utama yang perlu di-address:**
- ⚠️ Belum ada `_types/` dan `_lib/` subdirectories (hanya 2 dari 4 pola)
- ⚠️ Beberapa components masih monolithic (>20KB)
- ⚠️ Functional programming patterns belum eksplisit enforced
- ⚠️ Business rules validation bisa lebih ketat di layer aplikasi

---

## 🎯 1. Functional Programming (Score: 65/100)

### ✅ Yang Sudah Baik

**Pure Functions di Server Actions:**
```typescript
// tag-actions.ts - found good patterns
const createTagSchema = z.object({...}).refine(...)
const updateTagSchema = z.object({...})
// Validation schemas sebagai pure functions ✓
```

**Immutability:**
```typescript
// Penggunaan spread operator (good practice sudah ada)
return { ...tag, items: [...tag.items, newItem] }
```

**Kysely Type-Safe Queries:**
```typescript
// Type-safe SQL queries menggunakan Kysely builder
db.selectFrom('inventory.transaction_used_header')
  .innerJoin('inventory.transaction_used_item', '...', '...')
  .where('status', '=', 'OPEN')
  .selectAll()
```

### ⚠️ Yang Perlu Diperbaiki

**1. Composition Patterns:**
- Belum ada explicit utilities untuk function composition
- Belum ada `pipe` atau `compose` helpers

**2. Side Effects Isolation:**
- Database calls masih tersebar di seluruh server actions
- Tidak ada Repository pattern yang konsisten

**3. Higher-Order Functions:**
- Belum ada validation wrappers sebagai higher-order functions
- Tidak ada standardized error handlers

### 🔧 Recommendations

**A. Buat functional utilities:**
```typescript
// src/lib/fp/composition.ts
export const pipe = <T>(...fns: Array<(arg: T) => T>) =>
  (value: T) => fns.reduce((acc, fn) => fn(acc), value)

export const compose = <T>(...fns: Array<(arg: T) => T>) =>
  (value: T) => fns.reduceRight((acc, fn) => fn(acc), value)

// Validation HOF
export const withValidation = <S extends z.ZodTypeAny, R>(
  schema: S,
  handler: (data: z.infer<S>) => Promise<R>
) => async (input: unknown): Promise<R> => {
  const parsed = schema.parse(input)
  return handler(parsed)
}
```

**B. Repository Pattern untuk FP:**
```typescript
// src/lib/repositories/inventory.repository.ts
export const createInventoryRepository = (db: Kysely<DB>) => ({
  getById: (id: number) => 
    db.selectFrom('inventory.stock_balance')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst(),
  
  listByWarehouse: (whId: number) =>
    db.selectFrom('inventory.stock_balance')
      .where('warehouse_id', '=', whId)
      .selectAll()
      .execute(),
})
```

**C. Pure helper functions:**
```typescript
// src/lib/fp/validators.ts
export const isValidTransition = (
  from: Status, 
  to: Status, 
  validMap: Record<Status, Status[]>
): boolean => validMap[from]?.includes(to) ?? false

export const isInternalWarehouse = (
  wh: Warehouse, 
  currentBranch: string
): boolean => wh.branch === currentBranch
```

---

## 🧩 2. Reusable Components (Score: 85/100)

### ✅ Yang Sudah Baik

**10 Shared Components Aktif:**

| Component | Usage | Files |
|-----------|-------|-------|
| `CardBox` | 4+ apps | return-material, rekon-intech, hasil-rekon, inout-tag |
| `ConfirmDialog` | 2+ apps | return-material, rekon-intech |
| `DataTable` | 2+ apps | hasil-rekon, inout-tag |
| `DataTablePagination` | 1+ apps | hasil-rekon |
| `DateRangePicker` | 1+ apps | hasil-rekon |
| `ModalDialog` | 3+ apps | hasil-rekon, inout-tag |
| `SearchableSelect` | 3+ apps | return-material, rekon-intech, hasil-rekon |
| `StatusBadge` | ready | defined |
| `WarehouseCombobox` | ready | defined |
| `LoadingOverlay` | ready | defined |

**Composition Pattern:**
```typescript
// Good - ModalDialog reused in 3+ apps
import { ModalDialog } from '@/app/components/shared/ModalDialog';
```

### ⚠️ Yang Perlu Diperbaiki

**1. Missing Components (berdasarkan pattern):**
- ❌ `EmptyState` — untuk empty data tables
- ❌ `ErrorBoundary` — untuk error handling
- ❌ `LoadingSkeleton` — untuk loading states
- ❌ `ToastProvider` — wrapper untuk Sonner
- ❌ `FormField` — wrapper untuk Label + Input + Error
- ❌ `CurrencyInput` — untuk input currency
- ❌ `QuantityInput` — untuk input quantity dengan validasi

**2. Monolithic Components:**
- `CreateTagModal.tsx` — 21KB (sebaiknya di-split)
- `UpdateTagModal.tsx` — 13KB
- `InOutTagTable.tsx` — 13KB

**3. Duplicated Patterns (bisa di-abstract):**
- Form fields dengan error display
- Filter bars
- Action toolbars
- Status displays

### 🔧 Recommendations

**A. Tambahkan 7 components yang hilang:**

```typescript
// src/app/components/shared/EmptyState.tsx
export function EmptyState({ 
  title, description, action 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Icon className="h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// src/app/components/shared/LoadingSkeleton.tsx
export function LoadingSkeleton({ 
  rows = 5, columns = 4 
}: LoadingSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

// src/app/components/shared/ErrorBoundary.tsx
'use client'
export class ErrorBoundary extends Component<Props, State> {
  // ... standard error boundary implementation
}

// src/app/components/shared/FormField.tsx
export function FormField({ 
  label, error, children, required 
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}{required && '*'}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

**B. Refactor Monolithic Components:**

Split `CreateTagModal.tsx` (21KB) into:
```
_create-tag-modal/
├── index.tsx                    # Main modal
├── tag-form-fields.tsx          # Form fields
├── tag-items-table.tsx          # Items table
├── tag-validation.ts            # Validation logic
└── types.ts                     # Local types
```

**C. Create Abstraction Layers:**

```typescript
// src/app/components/shared/forms/FormSection.tsx
// src/app/components/shared/tables/TableFilters.tsx
// src/app/components/shared/tables/TableActions.tsx
// src/app/components/shared/feedback/ToastHelper.ts
```

---

## 🏗️ 3. Modular Architecture (Score: 70/100)

### ✅ Yang Sudah Baik

**Modular Structure di 12 Apps:**
```
src/app/(DashboardLayout)/apps/<page>/
├── _actions/          # ✅ Server actions
│   └── tag-actions.ts
├── _components/       # ✅ Client components
│   └── InOutTagTable.tsx
├── page.tsx           # ✅ Server Component
└── layout files
```

**Server vs Client Separation:**
- ✅ Server Actions di `_actions/` dengan `'use server'`
- ✅ Client Components di `_components/` dengan `'use client'`
- ✅ Main pages sebagai Server Components

### ⚠️ Yang Perlu Diperbaiki

**1. Inconsistent Subdirectories:**
- ✅ `_actions/` — 12 apps
- ✅ `_components/` — 10 apps
- ❌ `_types/` — 0 apps (TIDAK ADA)
- ❌ `_lib/` — 0 apps (TIDAK ADA)

**2. No Shared Types Location:**
- Types tersebar di berbagai files
- Tidak ada centralized type definitions

**3. No Shared Schemas:**
- Zod schemas di file yang sama dengan server actions
- Tidak ada reuse opportunity

**4. Feature Flags / Config Missing:**
- Tidak ada `feature.config.ts` per app
- Tidak ada environment-based toggles

### 🔧 Recommendations

**A. Standarisasi 4-Subdirectory Pattern:**

```bash
# Template untuk setiap app baru
src/app/(DashboardLayout)/apps/<page>/
├── page.tsx                    # Main page (Server Component)
├── _actions/                   # Server actions
│   ├── <page>-actions.ts       # Main CRUD
│   ├── bulk-actions.ts         # Bulk operations
│   └── index.ts                # Re-exports
├── _components/                # Client components
│   ├── <Page>Table.tsx         # Data table
│   ├── <Page>Form.tsx          # Form
│   ├── <Page>Filters.tsx       # Filter bar
│   ├── <Page>Actions.tsx       # Action toolbar
│   └── index.ts                # Re-exports
├── _types/                     # TypeScript types ⭐ NEW
│   ├── <page>.types.ts         # Main types
│   ├── forms.types.ts          # Form types
│   └── index.ts                # Re-exports
└── _lib/                       # Utilities & schemas ⭐ NEW
    ├── schema.ts               # Zod validation
    ├── columns.tsx             # Table columns
    ├── utils.ts                # Page-specific utilities
    └── index.ts                # Re-exports
```

**B. Refactor Existing Apps (contoh: inout-tag):**

```
src/app/(DashboardLayout)/apps/inout-tag/
├── page.tsx
├── _actions/
│   ├── tag-actions.ts          # Main CRUD
│   ├── bulk-actions.ts         # Bulk approve
│   └── index.ts
├── _components/
│   ├── InOutTagTable.tsx
│   ├── InOutTagClient.tsx
│   ├── CreateTagModal.tsx
│   ├── UpdateTagModal.tsx
│   ├── InOutTagDetailModal.tsx
│   ├── InOutTagCards.tsx
│   └── index.ts
├── _types/                     # ⭐ ADD
│   ├── inout-tag.types.ts
│   └── index.ts
└── _lib/                       # ⭐ ADD
    ├── schema.ts               # Extract Zod schemas
    ├── columns.tsx             # Extract table columns
    ├── utils.ts                # Extract utilities
    └── index.ts
```

**C. Shared Types Location:**

```typescript
// src/types/inventory.types.ts
export type InOutTag = {
  id: number;
  fromWhId: number;
  toWhId: number;
  status: 'OPEN' | 'IN_TRANSIT' | 'CLOSED' | 'CANCEL';
  // ...
}

// src/types/common.types.ts
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}
```

---

## 🗄️ 4. Database-Driven Business Rules (Score: 82/100)

### ✅ Yang Sudah Baik

**9+ Stored Procedures Digunakan:**

| Stored Procedure | Purpose | Location |
|-----------------|---------|----------|
| `sp_create_inout_tag` | Create InOut tag dengan stock validation | tag-actions.ts:312 |
| `sp_update_inout_tag` | Update InOut tag dengan stock check | tag-actions.ts:404 |
| `sp_return_material` | Return material dengan audit trail | tag-actions.ts:494 |
| `sp_record_material_used` | Record material usage | rekon-actions.ts:218 |
| `sp_edit_transaction_used` | Edit material usage | edit-rekon-actions.ts:69 |
| `sp_record_rekon_lensa_v2` | Record rekon lensa | rekon-lensa-actions.ts:257 |
| `sp_sap_out` | SAP out transaction | out-sap-actions.ts:319, 367 |
| (others) | - | - |

**Kysely Type-Safe Queries:**
```typescript
// Type-safe query builder (sudah excellent)
db.selectFrom('inventory.transaction_used_header')
  .innerJoin('inventory.transaction_used_item tui', 'tui.used_id', 'tuh.id')
  .where('tuh.status', '=', 'OPEN')
  .select(['tuh.id', 'tuh.created_at', 'tui.qty'])
```

**Business Rules di Application Layer:**
- ✅ Zod validation di server actions
- ✅ Status transition validation (in components)
- ✅ Internal/external WH check

### ⚠️ Yang Perlu Diperbaiki

**1. Business Rules Location:**
- Beberapa business rules masih di application layer (bukan stored procedures)
- Status transitions di-check di UI/components (bukan enforced di DB)

**2. Inconsistent Stored Procedure Usage:**
- Beberapa app pakai SP, beberapa pakai direct queries
- `db.transaction().execute` masih banyak (sebaiknya di-wrap dalam SP)

**3. Missing Audit Trail:**
- Tidak semua transaksi menggunakan audit trail
- Soft delete belum konsisten

**4. Bispro.md Validation:**
- Validasi bispro.md masih manual di component level
- Tidak ada automated check

### 🔧 Recommendations

**A. Prioritaskan Stored Procedures (PENTING):**

```typescript
// ❌ AVOID: Direct queries dengan transaction wrapping
await db.transaction().execute(async (trx) => {
  await trx.insertInto('inventory.transaction_used_header')...
  await trx.insertInto('inventory.transaction_used_item')...
  await trx.updateTable('inventory.stock_balance')...
})

// ✅ PREFER: Stored procedure (atomic, validated, audited)
await sql`CALL inventory.sp_record_material_used(
  ${warehouseId}::integer,
  ${designatorId}::integer,
  ${qty}::numeric,
  ${userId}::integer
)`.execute(db)
```

**B. Business Rules di Database:**

```sql
-- Status transition constraint (enforced di DB)
ALTER TABLE inventory.inout_tag_header
ADD CONSTRAINT chk_status_transition CHECK (
  (old_status = 'OPEN' AND new_status IN ('IN_TRANSIT', 'CANCEL'))
  OR (old_status = 'IN_TRANSIT' AND new_status IN ('CLOSED', 'CANCEL'))
  OR (old_status NOT IN ('CLOSED', 'CANCEL'))  -- Terminal states
)

-- Stock balance constraint
ALTER TABLE inventory.stock_balance
ADD CONSTRAINT chk_qty_positive CHECK (qty >= 0)

-- Internal WH constraint
ALTER TABLE inventory.transaction_used
ADD CONSTRAINT chk_internal_wh CHECK (
  warehouse_id IN (
    SELECT id FROM inventory.warehouse WHERE branch = current_user_branch()
  )
)
```

**C. Audit Trail Pattern:**

```sql
-- Generic audit trigger
CREATE OR REPLACE FUNCTION inventory.fn_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory.audit_log (
    table_name, operation, old_data, new_data, user_id, changed_at
  ) VALUES (
    TG_TABLE_NAME, TG_OP, 
    to_jsonb(OLD), to_jsonb(NEW), 
    current_setting('app.current_user_id')::integer,
    now()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**D. Bispro.md Validation di Application:**

```typescript
// src/lib/validation/bispro.ts
export const validateStockOperation = (params: {
  fromWh: Warehouse;
  toWh: Warehouse;
  qty: number;
  currentUserBranch: string;
}): ValidationResult => {
  // Rule: Internal WH deducts stock, external WH logs only
  if (params.fromWh.branch === params.currentUserBranch) {
    if (params.qty <= 0) {
      return { valid: false, error: 'Quantity must be positive' }
    }
  }
  return { valid: true }
}

export const validateStatusTransition = (
  from: Status, 
  to: Status
): ValidationResult => {
  const validTransitions: Record<Status, Status[]> = {
    REQUESTED: ['IN_TRANSIT', 'CANCEL'],
    IN_TRANSIT: ['CLOSED', 'CANCEL'],
    CLOSED: [],
    CANCEL: [],
  }
  if (!validTransitions[from]?.includes(to)) {
    return { 
      valid: false, 
      error: `Invalid transition: ${from} → ${to}` 
    }
  }
  return { valid: true }
}
```

---

## 🔐 5. Atomic Transactions & Data Integrity (Score: 80/100)

### ✅ Yang Sudah Baik

**DB Transactions dengan Kysely:**
```typescript
// Found in 5+ apps
await db.transaction().execute(async (trx) => {
  // Multi-step operation
  await trx.insertInto('table1')...
  await trx.insertInto('table2')...
  await trx.updateTable('table3')...
})
```

**Stored Procedures untuk Critical Ops:**
- `sp_create_inout_tag` — atomic dengan stock check
- `sp_sap_out` — atomic dengan stock update
- `sp_record_material_used` — atomic dengan stock update

**Idempotency:**
```typescript
// Good - checkAndStoreIdempotency
import { checkAndStoreIdempotency } from '@/lib/security/idempotency';
await checkAndStoreIdempotency(idemKey, userId)
```

**Zod Validation:**
- Schemas defined di setiap server action
- Runtime validation untuk semua inputs

### ⚠️ Yang Perlu Diperbaiki

**1. Mixed Patterns:**
- Beberapa pakai `db.transaction().execute` (kurang aman)
- Beberapa pakai `CALL sp_xxx` (lebih aman)
- Inkonsistensi di berbagai apps

**2. No Distributed Locking:**
- Concurrent transactions bisa race condition
- Tidak ada advisory locks atau row-level locks

**3. No Compensation Pattern:**
- Tidak ada saga pattern untuk multi-step
- Rollback logic belum robust

**4. No Optimistic Locking:**
- Tidak ada version column untuk concurrent updates

### 🔧 Recommendations

**A. Standardisasi: SELALU Gunakan Stored Procedures:**

```typescript
// src/lib/db/inventory-procedures.ts
export const inventoryProcedures = {
  createInOutTag: (params: CreateInOutTagParams) =>
    sql`CALL inventory.sp_create_inout_tag(
      ${params.fromWhId}::integer,
      ${params.toWhId}::integer,
      ${params.items}::jsonb,
      ${params.createdBy}::integer,
      ${params.idemKey}::varchar
    )`.execute(db),
  
  recordMaterialUsed: (params: RecordMaterialUsedParams) =>
    sql`CALL inventory.sp_record_material_used(
      ${params.warehouseId}::integer,
      ${params.designatorId}::integer,
      ${params.qty}::numeric,
      ${params.userId}::integer
    )`.execute(db),
  
  // ... all critical operations
}
```

**B. Locking untuk Concurrency:**

```sql
-- Advisory lock per warehouse
SELECT pg_advisory_xact_lock(hashtext('warehouse:' || $1));

-- Row-level lock
SELECT * FROM inventory.stock_balance
WHERE warehouse_id = $1 AND designator_id = $2
FOR UPDATE;
```

**C. Optimistic Locking:**

```typescript
// Add version column
export type WithVersion<T> = T & { version: number }

// Update with version check
await db.updateTable('inventory.inout_tag_header')
  .set({ ...data, version: (eb) => eb('version', '+', 1) })
  .where('id', '=', id)
  .where('version', '=', expectedVersion)  // Optimistic check
  .execute()
```

**D. Compensation Pattern:**

```typescript
// src/lib/transactions/compensating-transaction.ts
export const withCompensation = async <T>(
  operation: () => Promise<T>,
  compensate: (result?: T, error?: Error) => Promise<void>
) => {
  try {
    const result = await operation()
    return { success: true, result }
  } catch (error) {
    await compensate(undefined, error as Error)
    return { success: false, error }
  }
}
```

---

## 📈 Overall Score

| Category | Score | Status |
|----------|-------|--------|
| **1. Functional Programming** | 65/100 | ⚠️ Need work |
| **2. Reusable Components** | 85/100 | ✅ Good |
| **3. Modular Architecture** | 70/100 | ⚠️ Need work |
| **4. DB-Driven Business Rules** | 82/100 | ✅ Good |
| **5. Atomic Transactions** | 80/100 | ✅ Good |
| **OVERALL** | **78/100** | ⚠️ **GOOD** |

---

## 🎯 Priority Action Items

### 🔴 HIGH PRIORITY (Do First)

1. **Standarisasi 4-subdirectory pattern** di semua apps
   - Add `_types/` dan `_lib/` ke 12 existing apps
   - Time: 2-3 hours per app

2. **Tambah 7 missing shared components**
   - EmptyState, LoadingSkeleton, ErrorBoundary, FormField, dll
   - Time: 4-6 hours

3. **Refactor monolithic components**
   - Split CreateTagModal (21KB), UpdateTagModal (13KB)
   - Time: 6-8 hours

4. **Standarisasi stored procedure usage**
   - Replace `db.transaction().execute` dengan `CALL sp_xxx`
   - Time: 8-10 hours

### 🟡 MEDIUM PRIORITY (Do Next)

5. **Add functional programming utilities**
   - pipe, compose, withValidation HOFs
   - Time: 2-3 hours

6. **Implement Repository pattern**
   - Generic repositories untuk FP
   - Time: 4-6 hours

7. **Add business rules di database**
   - Constraints, triggers, audit logs
   - Time: 6-8 hours

8. **Implement optimistic locking**
   - Version column + check
   - Time: 3-4 hours

### 🟢 LOW PRIORITY (Nice to Have)

9. **Add distributed locking**
   - Advisory locks per warehouse
   - Time: 2-3 hours

10. **Implement saga/compensation pattern**
    - Multi-step transaction rollback
    - Time: 4-6 hours

11. **Add automated bispro.md validation**
    - CI check untuk business rules
    - Time: 4-6 hours

---

## ✅ Conclusion

**MTMS sudah memiliki fondasi arsitektur yang solid:**
- ✅ 10 reusable components aktif
- ✅ 9+ stored procedures untuk atomicity
- ✅ Modular `_actions/` dan `_components/` structure
- ✅ Type-safe queries dengan Kysely
- ✅ Zod validation di semua inputs

**Perbaikan utama yang dibutuhkan:**
- ⚠️ Standarisasi 4-subdirectory pattern (`_actions/`, `_components/`, `_types/`, `_lib/`)
- ⚠️ Tambahkan 7 shared components yang hilang
- ⚠️ Refactor monolithic components (>13KB)
- ⚠️ Konsistensi stored procedure usage
- ⚠️ Functional programming utilities

**Total estimasi waktu untuk mencapai 90+/100:**
- High priority: 20-30 jam
- Medium priority: 15-20 jam
- Low priority: 10-15 jam
- **Total: 45-65 jam** (2-3 minggu untuk 1 developer)

---

**Status:** ✅ **Foundation Solid, Refinement Needed**

**Recommendation:** Lanjutkan dengan high-priority items untuk konsistensi arsitektur di seluruh apps.

**Auditor:** Kiro AI
**Date:** 2026-10-09
**Project:** MTMS
**Verdict:** ⚠️ GOOD (78/100) — Production ready, refactoring recommended
