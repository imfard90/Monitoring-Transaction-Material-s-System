---
description: "Smart code review — Fast checks + focused analysis"
argument-hint: "[file-or-directory]"
---

# Code Review Workflow (Optimized)

> **Enhanced with:** Incremental checks, focused severity levels, component reuse validation

## Steps

### 1. Fast Quality Checks

```bash
# Incremental type check (10-15s vs 60s)
pnpm tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo

# Lint + format changed files only
pnpm dlx @biomejs/biome check --changed --write .
```

**If errors found:** Stop and report. Fix before proceeding.

### 2. Determine Review Scope

- **If argument provided:** Review specified file/directory
- **Otherwise:** Review recently modified files

```bash
git diff --name-only HEAD
```

### 3. Load Specialized Reviewers

Based on file types and content:

| File Type | Reviewer Agent |
|-----------|----------------|
| `.tsx`/`.jsx` | `react-reviewer` |
| `.ts` | `typescript-reviewer` |
| Auth/API/DB code | `security-reviewer` |
| Inventory/transaction code | `bispro.md` validator |

### 4. Apply Review Checklist

**Priority Focus (CRITICAL + HIGH only for speed):**

**CRITICAL (Block deployment):**
- Security vulnerabilities (SQL injection, XSS, auth bypass)
- Data integrity issues (stock logic errors, race conditions)
- Business rule violations (bispro.md)

**HIGH (Fix before merge):**
- Logic errors (null checks, edge cases)
- Performance issues (N+1 queries, missing indexes)
- Component duplication (not reusing shared components)

**MEDIUM/LOW (Optional detail):**
- Code quality, maintainability
- Style, naming, documentation
- Skip unless user requests full review

### 5. Component Reuse Validation

**Auto-check for:**
```typescript
// ❌ Component duplication detected
Custom table implementation in 3 files
→ Should use: DataTable from shared components

// ❌ Date picker recreated
Custom date range picker
→ Should use: DateRangePicker from shared components

// ❌ Status display inconsistent
Manual status styling
→ Should use: StatusBadge from shared components
```

### 6. Business Rule Validation

**For inventory/transaction code, auto-check:**
- Stock deduction includes internal WH check
- Status transitions follow bispro.md flow
- Transaction uses stored procedures
- Validation schemas present

### 7. Report Findings

**Format (Concise):**

```
✅ Code Review Complete

📊 Scope:
  • Files reviewed: [N]
  • Lines changed: [+X, -Y]

🎯 Findings:
  🔴 CRITICAL: [N] issues
  🟠 HIGH: [N] issues
  🟡 MEDIUM: [N] issues (collapsed by default)

[Detailed findings for CRITICAL + HIGH only]

💡 Recommendations:
  • [Top 3 actionable suggestions]

⏱️ Review time: [X seconds]
```

**If clean:**
```
✅ Code review passed

✓ TypeScript: 0 errors
✓ Biome: 0 issues
✓ Security: No vulnerabilities
✓ Business rules: Validated
✓ Component reuse: Optimal

🚀 Ready to commit!
```

---

## Performance

**Old workflow:** 90-120s (full review, all severity levels)
**New workflow:** 20-30s (incremental checks, CRITICAL+HIGH focus)

**Speed improvement:** 4x faster

---

## Usage Examples

```bash
# Review all recent changes
/review

# Review specific file
/review src/app/(DashboardLayout)/apps/inout-tag/page.tsx

# Review specific directory
/review src/app/(DashboardLayout)/apps/inout-tag/

# Full review (include MEDIUM/LOW)
/review --full
```
