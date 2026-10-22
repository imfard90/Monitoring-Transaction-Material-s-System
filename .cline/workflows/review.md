---
description: "Full code review — TypeScript check, Biome lint, React/security review"
argument-hint: "[file-or-directory]"
---

# Code Review Workflow

Review the requested scope and acceptance criteria first. Keep the review focused on the changed code and its relevant contracts; expand to adjacent paths for security or regression risk. This workflow does not authorize unrelated cleanup.

1. Run mandatory quality checks:

   ```bash
   # Read-only quality checks; do not reformat unrelated user changes
   pnpm tsc --noEmit
   pnpm lint
   pnpm exec biome check <changed-files>

   # Unit tests
   pnpm test:unit
   ```

   If errors are found, report them and distinguish pre-existing failures from regressions. Do not present the review as clean when required checks fail. Continue source inspection only if useful to diagnose findings, clearly marking the review/checks incomplete.

2. Determine review scope:
   - If argument provided: review specified file/directory
   - Otherwise: review recently modified files (`git diff --name-only HEAD`)

3. **Invoke `two-axis-code-review` skill** for the diff scope. Run both axes in parallel. Report findings side by side using the skill's format.

   **Severity mapping to MTMS:**
   - Standards hard violation → CRITICAL/HIGH
   - Baseline smell → MEDIUM (judgement call)
   - Spec missing requirement → CRITICAL/HIGH
   - Spec scope creep → MEDIUM/LOW

   The two axes are:
   - **Standards**: Does the code follow repo's documented coding standards? (Fowler Smell Baseline always applies)
   - **Spec**: Does the code match what the originating issue/spec asked for?

   Also invoke specialized reviewers based on file types for additional context:
   - `react-reviewer` for `.tsx`/`.jsx` files
   - `typescript-reviewer` for `.ts` files
   - `security-reviewer` for auth, API, database, or sensitive code

4. Report findings in structured format:
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
