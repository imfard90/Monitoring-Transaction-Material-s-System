# MTMS Agent Skills

Skill guides live in named directories under this folder. Each skill has one `SKILL.md` with YAML frontmatter (`name`, `description`). Keep guides aligned with `AGENTS.md`, the active migration runner, and the repositories; generic guidance does not override MTMS authorization, database, or API rules.

## Skill Categories

All skills live flat in this directory (`skill-name/SKILL.md`). The table below groups them by role for navigation; the folder names are the actual paths.

| Category | Skills |
|---|---|
| **Engineering** | `codebase-design`, `debugging`, `domain-modeling`, `research`, `tdd-workflow`, `two-axis-code-review`, `writing-docs` |
| **Architecture** | `clean-architecture`, `domain-driven-design`, `backend-patterns`, `frontend-patterns`, `postgres-patterns`, `redis-patterns`, `api-design` |
| **UI/UX** | `ui-ux-pro-max`, `design-system`, `ui-styling`, `frontend-a11y`, `make-interfaces-feel-better`, `motion-foundations`, `motion-advanced`, `motion-patterns`, `frontend-design-direction`, `design` |
| **Testing** | `react-testing`, `e2e-testing`, `browser-qa`, `security-scan`, `security-review` |
| **Code Quality** | `clean-code`, `code-complete`, `coding-standards`, `refactoring`, `refactoring-guru`, `error-handling`, `working-effectively-with-legacy-code` |
| **MTMS-specific** | `mtms-security-guide`, `mtms-create-page`, `mtms-change-branding`, `google-sheets`, `better-auth`, `nextjs-turbopack` |
| **Reference** | `a-philosophy-of-software-design`, `designing-data-intensive-applications`, `the-pragmatic-programmer` |
| **Productivity** | `grill-me`, `handoff`, `to-questionnaire`, `wait-what` |
| **Process** | `skill-authoring`, `git-workflow`, `database-migrations`, `accessibility`, `cybersecurity` |

## Where to Start

- **Google Sheets** application access and the read-only development MCP: [`google-sheets/SKILL.md`](google-sheets/SKILL.md).
- **Security reviews** covering agent workflows, prompt injection, and secret exposure: [`mtms-security-guide/SKILL.md`](mtms-security-guide/SKILL.md) plus [`security-guide.md`](mtms-security-guide/security-guide.md), read together with `.cline/workflows/security.md` and `AGENTS.md`. For NTE security review also follow `docs/NTE_SECURITY_WORKFLOW.md`. These guides inform review; they do not authorize implementation, migrations, or data writes.
- **UI work**: [`ui-ux-pro-max/SKILL.md`](ui-ux-pro-max/SKILL.md), [`design-system/SKILL.md`](design-system/SKILL.md), [`motion-foundations/SKILL.md`](motion-foundations/SKILL.md).
- **Domain modeling**: [`domain-modeling/SKILL.md`](domain-modeling/SKILL.md) plus the glossary and ADR register.

## Layer Separation

MTMS separates three layers on purpose. Keep new material in the correct one.

| Layer | Owns | Does not own |
|---|---|---|
| `.cline/workflows/*.md` | Entry points: which commands to run, in what order | Methodology, standards |
| `.agents/skills/**/SKILL.md` | How-to guidance and methodology for a task | Severity levels, approval gates |
| `.agents/rules/*.md` | Standards, severity mapping, approval criteria | Step-by-step procedure |

A workflow invokes a skill; a skill references a rule. Do not paste rule content into a skill or command sequences into a rule.

## Discovery and Invocation

Discover skills from the `SKILL.md` files in each directory; do not maintain fixed skill counts anywhere. Invoke the matching skill explicitly when its trigger applies.

Discover agent personas in `.agents/agents/*.md` and slash workflows in `.cline/workflows/*.md`. Consult `CLINE.md` for the current command index, and only invoke workflows that exist in that directory.

When `.cline/rules/` and `.agents/rules/` disagree, apply the stricter applicable project or security rule, check `AGENTS.md` and the authoritative source it names, and do not bulk-copy one directory over the other. Keep behaviorally relevant rule edits aligned in both locations and review differences deliberately.

## Adding or Changing a Skill

Follow [`skill-authoring/SKILL.md`](skill-authoring/SKILL.md). Short version: one skill per directory, frontmatter `description` starts with "Use when", keep `SKILL.md` under roughly 500 lines, put heavy reference in a sibling file, and test the skill against a baseline before claiming it works.

## Rules vs Skills

- **Rules** define standards and checklists that apply broadly: authorization requirements, severity levels, coverage thresholds.
- **Skills** provide executable how-to guidance for a specific domain: stored procedure patterns, React testing, migration procedure.

Rules tell you what to comply with; skills tell you how to do it.

## Standalone Scripts

For explicitly approved standalone non-inventory PostgreSQL data-fix scripts, use `src/lib/db/execute.ts`, load `dotenv/config` before any database access, verify the target and rollback path, and close the pool in a `finally` block. That helper provides tooling, not approval. Inventory mutations remain procedure and repository only; schema changes go through reviewed migrations; read-only inspection uses the Postgres MCP. Do not create ad-hoc read scripts, and do not infer approval to write data.
