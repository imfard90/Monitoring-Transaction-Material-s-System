---
description: "Full code review — TypeScript check, Biome lint, React/security review"
argument-hint: "[file-or-directory]"
---

# Code Review Workflow

1. Run mandatory quality checks:

   ```bash
   # Type check — must pass with zero errors
   pnpm tsc --noEmit

   # Biome lint + format
   pnpm dlx @biomejs/biome check --write .
   ```

   If errors found, stop and report them. Do not proceed with review until quality checks pass.

2. Determine review scope:
   - If argument provided: review specified file/directory
   - Otherwise: review recently modified files (`git diff --name-only HEAD`)

3. Load `code-reviewer` agent from `.agents/agents/code-reviewer.md`

4. Also invoke specialized reviewers based on file types:
   - `react-reviewer` for `.tsx`/`.jsx` files
   - `typescript-reviewer` for `.ts` files
   - `security-reviewer` for auth, API, database, or sensitive code

5. Apply review checklist from each reviewer:
   - **CRITICAL**: Security vulnerabilities, data leaks, auth bypasses
   - **HIGH**: Logic errors, race conditions, performance issues
   - **MEDIUM**: Code quality, maintainability, test coverage
   - **LOW**: Style, naming, documentation

6. Report findings in structured format:
   ```
   ## Review Summary
   Files reviewed: X
   Issues found: Y

   ## CRITICAL Issues
   [list if any]

   ## HIGH Issues
   [list if any]

   ## MEDIUM Issues
   [list if any]

   ## Recommendations
   [overall suggestions]
   ```

7. If no issues found: "✓ Code review passed. All checks clean."
