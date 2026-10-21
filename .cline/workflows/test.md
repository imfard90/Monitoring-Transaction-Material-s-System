---
description: "Run Vitest test suites (unit, integration, or targeted file) and verify test coverage"
argument-hint: "[target-path-or-suite]"
---

# Test Workflow

1. Load the matching testing guidance when relevant:
   - `tdd-workflow` for writing or changing tests: `.agents/skills/tdd-workflow/SKILL.md`.
   - `react-testing` for React component or hook tests: `.agents/skills/react-testing/SKILL.md`.
   - Discover other available skills from `.agents/skills/**/SKILL.md`; do not assume a skill exists if its guide is absent.

Start from the behavior being verified and select the narrowest useful test target; expand to the suite when the change or risk warrants it. For failures, capture the exact failing assertion/output, reproduce, inspect the affected contract, and test a causal hypothesis rather than making speculative changes.

1. Determine test target:
   - If argument provided (e.g. `tests/unit/api-auth.test.ts` or `unit` or `integration`):
     - For specific file: `pnpm vitest run [path]`
     - For unit suite: `pnpm test:unit`
     - For integration suite: `pnpm test:integration`
   - If no argument:
     - Run standard unit test suite: `pnpm test:unit`

2. Run static type checking to ensure test and source type soundness:
   ```bash
   pnpm tsc --noEmit
   ```

3. If running integration tests (`DATABASE_URL` required):
   ```bash
   pnpm test:integration
   ```

4. If checking test coverage:
   ```bash
   pnpm test:coverage
   ```

5. MTMS Testing Standards:
   - Target minimum 80% coverage on critical domain logic and server actions
   - AAA pattern (Arrange-Act-Assert)
   - Unit tests must be hermetic and fast (mock database / external APIs via Vitest `vi.mock`)
   - Test both positive (happy path) and negative (auth/validation errors) cases
   - Integration tests in `tests/integration/` verify real database objects and procedures

6. Report findings accurately:
   - Passed / failed / skipped tests and the exact command(s) run
   - Coverage metrics (if coverage run)
   - Any environment limitation or pre-existing failure, clearly distinguished from change-related failures
   - Diagnostic guidance for failures
   - Never describe a suite as passing if it was not run or had failures
