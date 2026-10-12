---
description: "Run Vitest test suites (unit, integration, or targeted file) and verify test coverage"
argument-hint: "[target-path-or-suite]"
---

# Test Workflow

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

6. Report findings:
   - Passed / failed tests summary
   - Coverage metrics (if coverage run)
   - Diagnostic guidance for any failing tests
