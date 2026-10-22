# Testing Requirements

## Minimum Test Coverage: 80%

Test Layers (choose by risk and changed behavior):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints and database operations when applicable
3. **E2E Tests** - Critical user flows when UI behavior or cross-system integration changes

Do not require unrelated test layers for documentation-only or narrowly scoped changes. Report unavailable DB/browser dependencies instead of claiming coverage.

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

## Troubleshooting Test Failures

1. Apply `.agents/skills/tdd-workflow/SKILL.md` where relevant; persona files are reference guidance, not dispatched agents.
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Related Guidance

- `.agents/skills/tdd-workflow/SKILL.md` — test-first implementation guidance (Red-Green-Refactor loop, vertical slices, tracer bullets)
- `.agents/skills/engineering/react-testing/SKILL.md` — React component/hook testing with RTL + Vitest
- `.agents/skills/e2e-testing/SKILL.md` — Playwright E2E testing for critical user flows

## Test Structure (AAA Pattern)

Prefer Arrange-Act-Assert structure for tests:

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### Test Naming

Use descriptive names that explain the behavior under test:

```typescript
test('returns empty array when no markets match query', () => {})
test('throws error when API key is missing', () => {})
test('falls back to substring search when Redis is unavailable', () => {})
```
