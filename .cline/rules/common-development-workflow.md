# Development Workflow

> This file extends [common/git-workflow.md](common-git-workflow.md) with the full feature development process that happens before git operations. For general engineering guidance, `.agents/rules/common-development-workflow.md` is canonical; this file adds Cline/MTMS operational details. Follow `AGENTS.md` for mandatory repository requirements.

## Feature Implementation Workflow

Follow the proportional research, planning, implementation, debugging, and verification process in `.agents/rules/common-development-workflow.md`. The steps below add MTMS-specific operational requirements; they do not require a persona dispatch, planning documents, commit, or push unless the task warrants or requests them.

0. **Research & Reuse** _(scale research to the task)_
   - **Inspect the project first:** Read relevant local code, tests, package versions, and project guidance; reuse established patterns before introducing new ones.
   - **Verify external behavior when needed:** Consult Context7 or primary vendor documentation when implementation depends on library/framework/API behavior, version-specific details, or an unfamiliar integration. Context7 is an option, not a requirement for every coding task; do not look up documentation for straightforward changes already covered by local patterns and tests.
   - **Research reuse opportunities when useful:** For new dependencies, substantial new functionality, or when local patterns are insufficient, search GitHub implementations and package registries before writing a bespoke solution. Use broader web research (such as Exa) only if primary docs and targeted code search do not answer the question.
   - Prefer adopting or adapting a proven approach when it fits the requirement; avoid external research that does not reduce uncertainty or implementation risk.

1. **Plan proportionally**
   - State intended behavior, acceptance criteria, assumptions, and risks.
   - Ask one focused clarification when a material business or security decision is ambiguous.
   - Write concise plans for multi-step or cross-module work; create architecture documents only when warranted.

2. **Test behavior changes**
   - Use the `tdd-workflow` skill where a regression test is feasible: RED, GREEN, IMPROVE.
   - Test public behavior and important failure/authorization paths; explain when test-first is impractical.
   - Apply `AGENTS.md` mandatory authorization, validation, repository, database, idempotency, and logging requirements.

3. **Debug systematically**
   - Reproduce the failure and capture evidence before editing.
   - Form a falsifiable hypothesis and change one causal factor at a time.
   - Verify the root cause and adjacent paths; avoid speculative fixes and unrelated cleanup.

4. **Review & verify**
   - Review the diff against requested behavior, `AGENTS.md`, and `bispro.md` where applicable; use `/review` and relevant skills when warranted.
   - Run relevant project checks and report actual results. Address CRITICAL and HIGH findings before completion.

5. **Ship only when requested or appropriate**
   - Do not commit or push unless asked or an invoked workflow explicitly requires it.
   - Follow [git-workflow.md](common-git-workflow.md) for commit messages and PR process.

---

## MTMS-Specific Workflow Steps

### DB Schema / Stored Procedure Changes

When the task involves database schema or stored procedures:

1. **Verify existing schema** via MCP before planning changes:
   ```
   /db-check <table-or-sp-name>
   ```
   This uses the `postgres__query` MCP tool to inspect the current DB state. Never assume schema details.

2. **Draft migration file** under `src/lib/db/migrations/` following the naming convention (`NNN_<description>.sql`).

3. **Run migrations** via:
   ```
   /migrate
   ```
   Or directly: `pnpm migrate` (runs `run-migration.ts`)

4. **Verify migration success**:
   - Run integration tests: `pnpm test:integration`
   - Confirm with MCP: `/db-check` to verify the new objects exist

5. **Sync Kysely types** — if tables/columns changed:
   - Update `src/lib/db/database.types.ts` to match
   - Run `pnpm tsc --noEmit` to catch type drift

6. **Write tests** for new SPs following the pattern in `tests/integration/migrations.test.ts`.

### Script / One-Off Tool Changes

When writing or modifying scripts that connect to the database:

1. Use the read-only MCP for inspection. Only run an explicitly authorized, reviewed data-fix script via `src/lib/db/execute.ts`; inventory mutations remain stored-procedure/repository-only and schema changes use migrations.
2. **Import `dotenv/config`** at the top of the entry file before any DB access.
3. **Call `pool.end()`** in a `finally` block to prevent connection leaks.
4. **Do NOT** create ad-hoc Node scripts for read-only queries — use the MCP `postgres__query` tool instead.
