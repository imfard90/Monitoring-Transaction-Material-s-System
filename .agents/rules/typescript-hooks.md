---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Verification & Quality Checks

> This file extends [common/hooks.md](common-hooks.md) with MTMS TypeScript/JavaScript specific validation.

## Local Quality Tooling

MTMS uses **Biome** as its primary formatter and linter, alongside **tsc** for static type analysis:

- **Formatting**: `pnpm format` (runs `biome format --write .` - sub-100ms execution)
- **Linting & Import Sorting**: `pnpm lint` (runs `biome lint .`) or `pnpm check`
- **Type Checking**: `pnpm tsc --noEmit` (strict TypeScript validation)
- **Unit Testing**: `pnpm test:unit` (Vitest unit test runner)

## Cline Execution Guidance

Cline does not run background shell hooks automatically. Instead, agents must validate code changes directly using the following steps before concluding tasks:

1. **Format & Lint**: Run `pnpm format` and `pnpm lint` after modifying TypeScript files.
2. **Type Check**: Execute `pnpm tsc --noEmit` to ensure type soundness.
3. **Audit `console.log`**: Production code must use structured loggers (`actionLogger`, `securityLogger`, `dbLogger`) from `@/lib/logger`; Biome's `noConsole` rule will flag raw `console.log` statements.
4. **Slash Workflows**: Use `/review` or `/commit` workflows to execute these verification steps in sequence.
