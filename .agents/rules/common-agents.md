# Agent Roles & Skill Orchestration

## Cline Execution Model in MTMS

In the Cline environment, specialized capabilities are orchestrated through:

1. **The `skills` tool**: Project and framework skills located in `.agents/skills/`; the active skill count is the number of `SKILL.md` files, not a maintained constant.
2. **Slash Command Workflows**: Operational routines located in `.cline/workflows/`; use only commands present in that directory.
3. **Persona reference profiles**: Guidance documents located in `.agents/agents/`; they are not independently dispatched agents in this Cline workspace. Treat their count as a file inventory, not a measure of active runtime agents.

## Skill Invocation

Use skills as focused guidance, not as a gate for ordinary conversation or every tool call.

- Invoke a relevant skill once per task when specialized guidance materially applies.
- Do not invoke skills solely for general questions, clarification, status checks, or discussion of tool behavior.
- After skill guidance returns, follow it for the task; do not repeat an identical invocation.
- If a skill call fails, do not blindly retry identical input. Retry only with a concrete changed input; otherwise stop and report the failure.
- A task may use multiple distinct skills when separate needs justify them. Skill guidance complements and cannot override `AGENTS.md` or user instructions.

### Skill Priority
When multiple skills apply, process skills come first:
- Complex feature → `clean-architecture` / `domain-driven-design` first, then implementation skills.
- Bug fix → `tdd-workflow` / `diagnosing-bugs` first, then domain skills.
- Code review → `coding-standards` / `code-complete` first.
- Security audit → `security-review` / `mtms-security-guide` first.

## Discovery and Source of Truth

- Persona files under `.agents/agents/` are descriptive reference profiles, not independently dispatched agents in this Cline workspace. Apply a profile's relevant guidance directly only when useful; do not assume autonomous dispatch, delegation, or parallel execution.
- Discover available skills from `.agents/skills/**/SKILL.md`, personas from `.agents/agents/*.md`, and workflows from `.cline/workflows/*.md`; do not rely on fixed counts or assume a workflow/parallel-agent feature exists.
- See `CLINE.md` for the workflow command index and `.agents/skills/README.md` for skill guidance. Invoke matching skills explicitly when relevant.
- For security posture of agent workflows and NTE-specific review, read `.agents/skills/mtms-security-guide/security-guide.md` and `docs/NTE_SECURITY_WORKFLOW.md`, respectively; neither document authorizes implementation or data writes.
- If `.cline/rules/` and `.agents/rules/` differ, check `AGENTS.md` and its named authoritative sources, apply the stricter applicable requirement, and align both copies for behaviorally relevant rule changes. Do not bulk-copy directories.
- `.agents/rules/` is canonical for general engineering standards. `.cline/rules/` may contain Cline/MTMS operational supplements; when same-named files differ, preserve those supplements and resolve conflicts against `AGENTS.md` and its named authoritative sources.

## Key Specialized Roles & Personas

When tackling distinct phases of development, apply relevant profile guidance and skills directly; profiles are not dispatched agents:

| Guidance profile (not dispatched) | Associated Skills & Primary MCP Tools | When to Apply |
|---|---|---|
| **Planner / Architect** | `clean-architecture`, `domain-driven-design` • **MCP**: `postgres__query`, `context7__query-docs` | Complex features, refactoring, database design |
| **Code Reviewer** | `coding-standards`, `git-workflow`, `/review` • **MCP**: `github__get_pull_request`, `github__get_pull_request_files`, `github__create_pull_request_review` | Reviewing modified code and PRs before commits |
| **Security Reviewer** | `security-review`, `mtms-security-guide`, `/security` • **MCP**: `postgres__query`, `github__list_commits` | Auth changes, API keys, endpoints, DB access |
| **Documentation Specialist** | `research`, `docs-lookup` • **MCP**: `context7__resolve-library-id`, `context7__query-docs`, `github__search_code` | Authoritative documentation lookups, external APIs |
| **Database Specialist**| `postgres-patterns`, `database-migrations`, `/db-check` • **MCP**: `postgres__query` | Stored procedures, Kysely queries, schemas |
| **Integration Specialist** | `google-sheets` • **MCP**: `mtms-google-sheets__list_sheets`, `mtms-google-sheets__read_sheet_range` | External warehouse sheet sync & verification |
| **TDD / Test Guide** | `tdd-workflow`, `react-testing`, Vitest | Writing unit tests, reproducing bugs |
| **UI/UX Designer** | `ui-ux-pro-max`, `design-system`, `motion-patterns` | Frontend layouts, forms, tables, accessibility |

### Mandatory MCP Alignment Policy

All priority skills and agents **MUST** utilize active MCP servers for domain operations:
1. **Database Operations**: ALWAYS use `postgres__query` for introspection and query analysis. Never create ad-hoc node scripts. Schema changes must use migrations (`pnpm migrate`), and inventory mutations must use stored procedures via repositories.
2. **GitHub Operations**: ALWAYS use `github__*` MCP tools (`get_pull_request`, `get_pull_request_files`, `list_commits`, `search_code`, `create_pull_request_review`) for PR analysis, commit tracking, and remote code search. Never parse web pages or run ad-hoc cURL commands.
3. **Library & Framework Documentation**: ALWAYS use `context7__*` MCP tools (`resolve-library-id`, `query-docs`) for authoritative documentation (Next.js, Tailwind, Kysely, TanStack Table) instead of guessing from training data.
4. **Google Sheets Operations**: ALWAYS use `mtms-google-sheets__*` MCP tools (`list_sheets`, `read_sheet_range`) for developer inspection of synced external warehouse spreadsheets.

## Immediate Role Activation

Proactively apply these methodologies without waiting for user prompting:

1. **Complex Feature Requests**: Plan architectural changes, check `bispro.md` and `AGENTS.md`.
2. **Code Modified**: Validate with Biome (`pnpm format`, `pnpm lint`) and `pnpm tsc --noEmit`.
3. **Bug Fixes**: Write failing unit tests with Vitest before fixing implementation.
4. **Security Surfaces**: Ensure server actions check `getSessionUser()`/`getSessionNik()` and validate input schemas with Zod.

## Multi-Perspective Analysis

When solving complex architectural or security problems:

- **Factual Review**: Check database constraints, foreign keys, and stored procedure signatures.
- **Security Check**: Enforce auth, input sanitization, API rate limiting, and secret redaction.
- **Consistency Check**: Align with existing patterns in `src/lib/repositories/` and `src/components/ui/`.

---

## MTMS MCP: Server Infrastructure

MTMS utilizes Model Context Protocol (MCP) servers to provide secure, direct tooling for agents across databases, external frameworks, and version control. See `docs/MCP.md` for complete architecture and tool definitions.

### 1. PostgreSQL MCP Server (`postgres`)

- **Tool**: `postgres__query`
- **Purpose**: Read-only database introspection, table structure inspection, index analysis, and data preview.
- **Rules**: Strictly read-only; no writes via MCP. No ad-hoc query scripts.

### 2. GitHub MCP Server (`github`)

MTMS integrates `@modelcontextprotocol/server-github` to allow agents to interact with GitHub directly using the developer's `GITHUB_PERSONAL_ACCESS_TOKEN`.

- **Tools Exposed (26 tools)**:
  - **Pull Requests**: `get_pull_request`, `list_pull_requests`, `get_pull_request_files`, `get_pull_request_status`, `create_pull_request`, `create_pull_request_review`, `merge_pull_request`, `update_pull_request_branch`, `get_pull_request_comments`, `get_pull_request_reviews`
  - **Issues & Comments**: `get_issue`, `list_issues`, `create_issue`, `update_issue`, `add_issue_comment`, `search_issues`
  - **Repository & Commits**: `list_commits`, `create_branch`, `search_repositories`, `fork_repository`, `create_repository`
  - **Code & Content**: `search_code`, `search_users`, `get_file_contents`, `create_or_update_file`, `push_files`
- **Usage Rules**:
  - Read-only tools (`get_*`, `list_*`, `search_*`) are in Cline's `alwaysAllow` for fast context gathering.
  - Write/mutation tools (`create_pull_request`, `merge_pull_request`, `create_issue`, `push_files`, `create_pull_request_review`) require developer confirmation before execution.
  - Never log or commit personal access tokens. Tokens are managed in `.env` and synced via `./scripts/setup/setup-cline-mcp.sh`.

### Verification

- **Database MCP**: Confirm with `/db-check`.
- **GitHub MCP**: Run `./scripts/setup/setup-cline-mcp.sh` to test GitHub API authentication and generate configuration files.