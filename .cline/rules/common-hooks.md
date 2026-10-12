# Task Verification & Workflow Standards

## Cline Workflow System

Cline operates with slash command workflows located in `.cline/workflows/` and tool calls rather than automatic background shell hooks. Verification is performed proactively by the agent during and after task execution.

## Core Verification Phases

1. **Pre-Implementation**:
   - Read relevant business requirements (`bispro.md`) and security rules (`AGENTS.md`).
   - Formulate a clear, numbered plan before issuing file edits.
2. **Post-Implementation Verification**:
   - Auto-format and lint using local scripts: `pnpm format` and `pnpm lint`.
   - Verify type safety: `pnpm tsc --noEmit`.
   - Run unit/integration tests: `pnpm test:unit`.
3. **Session Completion**:
   - Run full verification checks or relevant slash commands (`/review`, `/security`, `/commit`).
   - Summarize changes, validation results, and any pending requirements.

## Task Tracking Best Practices

- Explicitly track multi-step progress in response plans (using markdown checklists `[ ]` / `[x]`).
- Break down tasks with clear granularity to enable real-time steering.
- Catch missing items, order discrepancies, or business logic edge cases before running code mutations.
