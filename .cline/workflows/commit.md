---
description: "Commit and push changes with a descriptive conventional commit message"
argument-hint: "[optional-context]"
---

# Commit Workflow

1. Analyze the current changes to understand what needs to be committed:

    ```bash
    # Check for staged and unstaged changes
    git status --short

    # View the diff of all changes (staged and unstaged)
    git diff HEAD
    ```

2. Based on the diff output, formulate a commit message following conventional commit format:

    - **feat**: New feature or functionality
    - **fix**: Bug fix
    - **refactor**: Code restructuring without behavior change
    - **docs**: Documentation changes
    - **test**: Adding or updating tests
    - **chore**: Maintenance tasks, dependencies, configs
    - **style**: Formatting, whitespace, no logic changes
    - **perf**: Performance improvements

    Format: `type(scope): brief description`

    MTMS scope examples:
    - `feat(inout-tag): add bulk status update action`
    - `fix(out-sap): resolve stock balance deduction on partial return`
    - `refactor(dashboard): extract TopCards into reusable component`
    - `chore(deps): update shadcn/ui to latest`
    - `fix(auth): correct session expiry redirect loop`

3. Run mandatory quality checks **before** staging:

    ```bash
    # Type check — must pass with zero errors
    pnpm tsc --noEmit

    # Biome lint + format check
    pnpm dlx @biomejs/biome check --write .
    ```

    **If type errors exist:**
    - Fix all TypeScript errors before proceeding
    - Re-run `pnpm tsc --noEmit` to confirm clean

    **If Biome reports errors:**
    - Run `pnpm format` to auto-fix formatting
    - Run `pnpm lint` to see remaining lint issues
    - Fix lint issues manually, then re-run checks

4. Stage all changes:

    ```bash
    git add -A
    ```

5. Commit with the generated message:

    ```bash
    git commit -m "type(scope): brief description"
    ```

    **If pre-commit hooks fail:**
    - Review the error output (Biome errors, type errors, etc.)
    - Fix the identified issues in the affected files
    - Re-stage: `git add -A`
    - Retry: `git commit -m "type(scope): brief description"`

6. Push to the remote repository:

    ```bash
    git push
    ```

    **If pre-push hooks fail:**
    - Review the hook output and fix any issues
    - Re-run the push after fixes
