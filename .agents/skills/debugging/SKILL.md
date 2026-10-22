---
name: debugging
description: Disciplined diagnosis loop for hard bugs and performance regressions. Use when tests flaky, behavior inexplicable, or performance degraded. Build feedback loop: red → minimize → hypothesize → instrument → fix → regression-test.
---

# Debugging

## Overview

**Debugging IS a disciplined loop**, not guessing. Every cycle: reproduce → isolate → hypothesize → verify → fix → confirm.

**Core principle:** The bug is in your understanding, not the code. Narrow the gap.

## The Loop

### 1. Red — Reproduce reliably
- Write a failing test (unit/integration/e2e) that captures the bug
- If flaky: run 10×, capture exact failure rate and conditions
- No test? Create minimal reproduction script first
- **Success criterion:** Single command reproduces consistently

### 2. Minimize — Reduce to essence
- Delete code until bug disappears, then add back one piece at a time
- Binary search: disable half the system, test, repeat
- Goal: Smallest possible reproduction (ideally <50 lines)
- **Success criterion:** Removing any line makes bug vanish

### 3. Hypothesize — Form falsifiable theory
- Write down: "I believe X causes Y because Z"
- Theory must be testable: "If I change X, Y should change to Z"
- Rank hypotheses by likelihood and ease of testing
- **Anti-pattern:** "Maybe it's X" without prediction

### 4. Instrument — Observe directly
- Add logging, metrics, breakpoints at the seam
- Use structured logging (`actionLogger`, `dbLogger`) not `console.log`
- For async: trace IDs, correlation IDs across boundaries
- **Success criterion:** Can see internal state at failure point

### 5. Fix — Minimal targeted change
- Change only what hypothesis predicts
- If fix doesn't match hypothesis, STOP — hypothesis was wrong
- Re-run minimized reproduction: must pass
- **Anti-pattern:** Shotgun changes hoping one works

### 6. Regression-test — Lock it in
- Add permanent test at the seam where bug manifested
- Test must fail before fix, pass after
- Run full test suite: `pnpm test:unit && pnpm test:integration`
- **Anti-pattern:** "Works now" without test

## Anti-Patterns to Avoid

| Anti-Pattern | Symptom | Fix |
|--------------|---------|-----|
| **Shotgun debugging** | Multiple unrelated changes per attempt | One hypothesis, one change per cycle |
| **Print debugging** | `console.log` scattered, no structure | Use `actionLogger`/`dbLogger` with trace IDs |
| **Theory attachment** | Refusing to discard disproven hypothesis | Write hypothesis down; falsify ruthlessly |
| **Layer violation** | Debugging UI when bug is in DB | Isolate layer first via tests |
| **No regression test** | Bug returns in 2 weeks | Every fix gets a test at the seam |

## MTMS Integration

- **Server Actions:** Reproduce via Vitest unit test mocking `@/lib/auth-server`
- **Database:** Use MCP `postgres__query` for read-only introspection; `pnpm test:integration` for SP behavior
- **External API:** Use MSW handlers in tests; `authenticateApiRequest` must be first line
- **Rate limiting:** Test with `checkAndConsumeApiRateLimit` atomic Redis ops
- **Logs:** Search `actionLogger`/`securityLogger` output; never `console.*` in server code

## Red Flags — Stop and Restart Loop

- [ ] Changed >3 files without confirming hypothesis
- [ ] No failing test written yet
- [ ] "It works on my machine" — run in CI environment
- [ ] Guessing instead of instrumenting
- [ ] Fix applied but original reproduction not re-verified

## When to Escalate

- Loop exceeded 3 cycles without progress → pair with human
- Bug involves data corruption → immediate security review (`/security`)
- Performance regression >20% → `/perf` workflow with flamegraphs