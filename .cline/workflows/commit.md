---
description: "Smart commit with auto code review and quality checks"
argument-hint: "[optional-context]"
---

# Commit Workflow (Optimized)

> **Enhanced with:** Auto review, fast quality checks, smart error recovery

## Steps

### 1. Analyze Changes

```bash
# Check what's changed
git status --short

# View detailed diff
git diff HEAD
```

### 2. Generate Conventional Commit Message

**Format:** `type(scope): brief description`

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `docs`: Documentation
- `test`: Tests
- `chore`: Maintenance
- `style`: Formatting
- `perf`: Performance

**MTMS Examples:**
- `feat(inout-tag): add bulk approve action`
- `fix(out-sap): correct stock deduction logic`
- `refactor(shared): extract DataTable filters`
- `chore(deps): update Next.js to 16.1`

### 3. Run Fast Quality Checks

```bash
# Incremental type check (faster)
pnpm tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo

# Lint + format changed files only
pnpm dlx @biomejs/biome check --changed --write .
```

**Auto-recovery (max 2 attempts):**
- If fixable errors → Auto-fix and retry
- If unfixable → Report and stop

### 4. Auto Code Review (CRITICAL + HIGH only)

**Check for:**
- Security issues (SQL injection, XSS, auth bypass)
- Business rule violations (bispro.md)
- Logic errors (race conditions, null checks)
- Performance issues (N+1 queries, missing indexes)

**Action:**
- CRITICAL issues → Block commit
- HIGH issues → Warn, allow with confirmation
- MEDIUM/LOW → Skip (handle in dedicated /review)

### 5. Stage Changes

```bash
git add -A
```

### 6. Commit

```bash
git commit -m "type(scope): description"
```

**If pre-commit hook fails:**
- Auto-fix attempt (1x)
- If fails → Report errors, user fixes manually

### 7. Push

```bash
git push
```

### 8. Summary

```
✅ Commit Successful

📝 Commit: type(scope): description
🔍 Files changed: [N]
✓ Type check: 0 errors
✓ Biome: 0 issues
✓ Code review: No CRITICAL issues

🚀 Pushed to remote
```

---

## Performance

**Old workflow:** 60-90s (full checks)
**New workflow:** 15-25s (incremental checks)

**Speed improvement:** 3-4x faster
