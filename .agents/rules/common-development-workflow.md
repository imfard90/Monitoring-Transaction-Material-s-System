# Development Workflow

> This file extends [common/git-workflow.md](common-git-workflow.md) with the full feature development process that happens before git operations.

The Feature Implementation Workflow describes research, planning, implementation, review, verification, and shipping. Scale the process to task risk and size: small fixes do not require architecture documents; cross-module or high-risk work should have a concise written plan and acceptance criteria.

## Feature Implementation Workflow

0. **Research & Reuse**
   - Inspect relevant local code, tests, package versions, and project guidance first. For inventory/transaction work, read `bispro.md` and check `docs/AUDIT_REPORT.md` as required by `AGENTS.md`.
   - Consult Context7 or primary vendor documentation when behavior is version-specific, unfamiliar, or not established by local patterns/tests.
   - Research external implementations only when it reduces uncertainty; prefer existing project patterns and avoid unnecessary dependencies.

1. **Understand & Plan (proportional)**
   - State intended behavior and observable acceptance criteria; identify assumptions, risks, and affected boundaries.
   - Ask one focused clarification when a material business/security decision is ambiguous. Do not proceed on a conflicting assumption.
   - For multi-step, cross-module, or cross-session work, use the **planner** persona and write a concise plan. Create broader architecture documents only when the change warrants them.
   - For work spanning sessions, optionally use `docs/agent-work/TEMPLATE.md` as a concise handoff. It is a note, not a source of truth; re-check code, migrations, and business rules on resume.

2. **Implement with tests**
   - Use the **tdd-guide** persona for behavior changes and bug fixes where a regression test is feasible: establish a failing test (RED), implement the smallest fix (GREEN), then refactor (IMPROVE).
   - Test public behavior and important failure/authorization paths. If test-first is impractical, state why and still add relevant verification.
   - Follow `AGENTS.md` for mandatory authorization, validation, repository, database, idempotency, and logging requirements. Never weaken invariants to make a test pass.

3. **Debug systematically**
   - Reproduce the failure and capture evidence before editing.
   - Form a falsifiable hypothesis, inspect relevant call path/contracts, and change one causal factor at a time.
   - Verify the root cause and adjacent paths; avoid speculative fixes and unrelated cleanup.

4. **Review & verify before completion**
   - Review the diff against requested behavior, acceptance criteria, `AGENTS.md`, and `bispro.md` where applicable. Use `/review` and specialized personas when warranted.
   - Run relevant project checks and report actual results. Do not claim a check passed unless it was run and passed; disclose skipped checks and blockers.
   - Address CRITICAL and HIGH findings before completion; resolve MEDIUM findings when practical or explain deferral.

5. **Ship (only when requested/appropriate)**
   - Do not commit or push unless asked or the invoked workflow explicitly calls for it.
   - Follow [git-workflow.md](common-git-workflow.md) for conventional commit messages and PR process.

## Cross-session handoff

For an ongoing multi-phase task only, a handoff note may record goal, decisions, completed work, changed files, verification evidence, blockers, and next action. Keep it concise and sanitized: no secrets, credentials, tokens, customer/employee data, raw logs, or copied conversation. Treat it as potentially stale and verify facts against repository sources before acting. Do not create permanent agent memory or automatically capture sessions.
