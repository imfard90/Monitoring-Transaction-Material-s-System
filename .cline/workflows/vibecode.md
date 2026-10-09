---
description: "⚡ Vibecode mode - Fast implementation with auto-quality checks"
argument-hint: "[feature-description]"
---

# Vibecode Workflow (Fast Mode)

> **Focus:** Speed + Quality + Consistency
> **When:** Simple-to-medium features, bug fixes, UI improvements

## Auto-Detection Rules

**This workflow automatically:**
1. Detects complexity level (simple/medium/complex)
2. Applies appropriate implementation strategy
3. Enforces MTMS conventions
4. Validates against bispro.md (if inventory-related)
5. Reuses existing components
6. Runs quality checks
7. Auto-commits if clean

---

## Workflow Steps

### 1. Parse Request & Detect Complexity

Analyze the request to determine:

**SIMPLE** (Direct implementation):
- UI tweaks (button, styling, text changes)
- Single file modifications
- Bug fixes without business logic changes
- Component prop additions
→ **Action:** Code immediately, no planning

**MEDIUM** (Quick plan + implement):
- 2-3 file changes
- New UI component with state
- Server action additions
- Form validations
→ **Action:** Brief outline, then code

**COMPLEX** (Use planner agent):
- >3 files affected
- Database schema changes
- New transaction types
- Business logic involving bispro.md
→ **Action:** Redirect to planner agent

---

### 2. Check Business Rules (Auto)

**If request involves:**
- `stock`, `inventory`, `warehouse`, `transaction`, `material`, `technician`, `InOut`, `OutSAP`, `Return`

**Then automatically:**
1. Read relevant sections from `bispro.md`
2. Identify applicable business rules
3. Keep rules in memory for validation

---

### 3. Check Reusable Components (Mandatory)

**Before creating ANY new UI component, check:**

```typescript
// Tables & Data Display
src/app/components/shared/DataTable.tsx
src/app/components/shared/DataTablePagination.tsx
src/app/components/shared/StatusBadge.tsx
src/app/components/shared/EmptyState.tsx
src/app/components/shared/LoadingSkeleton.tsx

// Forms & Inputs
src/app/components/shared/DateRangePicker.tsx
src/app/components/shared/SearchableSelect.tsx

// Dialogs & Modals
src/app/components/shared/ModalDialog.tsx
src/app/components/shared/ConfirmDialog.tsx

// Error Handling
src/app/components/shared/ErrorBoundary.tsx
```

**Rule:** REUSE over RECREATE. Only create new component if truly unique.

---

### 4. Implement (Code-First Style)

**Response Format:**

```
[CODE BLOCKS - Show all files immediately]

✓ [Brief summary of what was added/changed]
  - File 1: purpose
  - File 2: purpose
  - File 3: purpose

[Optional details in collapsible section if needed]
```

**Implementation Standards:**

- Server Components by default (no "use client" unless needed)
- Server Actions in `_actions/` subdirectory
- Types in `_types/` subdirectory
- Reusable utils in `_lib/` subdirectory
- TypeScript strict mode (explicit types for exports)
- Zod validation for all user inputs
- Error handling with try-catch
- Loading states for async operations
- Toast notifications for user feedback

**Naming Conventions:**
- Files: `kebab-case.tsx`
- Components: `PascalCase`
- Functions: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

---

### 5. Auto-Validate Business Rules

**During implementation, automatically check:**

**Stock Operations:**
```typescript
// ✓ Check if WH is internal before deducting stock
const fromWh = await getWarehouse(fromWhId)
if (fromWh.branch === currentUserBranch) {
  // Internal - deduct stock
} else {
  // External - log only, don't deduct
}
```

**Transaction Status:**
```typescript
// ✓ Validate status transitions per bispro.md
const validTransitions = {
  REQUESTED: ['IN_TRANSIT', 'CANCEL'],
  IN_TRANSIT: ['CLOSED', 'CANCEL'],
  CLOSED: [], // Terminal state
  CANCEL: [], // Terminal state
}
```

**Data Accuracy:**
```typescript
// ✓ Use stored procedures for critical transactions
await db.executeQuery(
  sql`SELECT sp_close_inout_tag(${tagId}, ${items})`
)

// ✓ Validate with Zod schemas
const schema = z.object({
  qty: z.number().positive(),
  material_id: z.string().uuid(),
})
```

---

### 6. Run Quality Checks (Fast)

```bash
# Incremental type check (10-15s vs 60s full check)
pnpm tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo

# Lint + format only changed files (2-3s)
pnpm dlx @biomejs/biome check --changed --write .
```

**If errors found:**
1. Attempt auto-fix (max 2 attempts)
2. If auto-fix fails, report errors and stop
3. User fixes manually, then re-run workflow

---

### 7. Summary Report

**Output format:**

```
✅ Vibecode Complete

📝 Changes Made:
  • Added: [list new files]
  • Modified: [list changed files]
  • Reused: [list shared components used]

🎯 Quality Checks:
  ✓ TypeScript: 0 errors
  ✓ Biome: 0 issues
  ✓ Business rules: Validated
  ✓ Components: Reused [N] shared components

⏱️ Time: [X seconds]

🚀 Ready to test!
```

---

## Special Cases

### Case 1: New Page Creation

If request is to create a new page, redirect to:
```bash
/new-page <page-name> [description]
```

### Case 2: Complex Transaction Logic

If request involves new transaction types or complex business logic, redirect to planner agent.

### Case 3: Refactoring Needed

If code duplication detected (3+ times), suggest extraction to shared utility.

---

## Performance Targets

- **Simple feature:** < 2 min end-to-end
- **Medium feature:** < 10 min end-to-end
- **Quality checks:** < 20s (incremental)
- **Code generation:** Immediate (no long explanations)

---

## Anti-Patterns (Avoid)

❌ **Don't:**
- Create new components without checking shared components first
- Implement stock operations without reading bispro.md
- Skip validation schemas (use Zod)
- Use `any` type in TypeScript
- Hardcode magic numbers/strings
- Skip error handling
- Forget loading states
- Miss toast notifications

✅ **Do:**
- Reuse existing shared components
- Validate business rules automatically
- Use Zod schemas for all inputs
- Add explicit TypeScript types
- Use constants for magic values
- Handle errors gracefully
- Show loading feedback
- Notify users of success/failure
