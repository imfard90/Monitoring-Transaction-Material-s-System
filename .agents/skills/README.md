# MTMS Agent Skills

Skill guides live in their named directories under this folder. Keep these guides aligned with `AGENTS.md`, the active migration runner, and repositories; generic ECC guidance does not override MTMS authorization or database rules.

For Google Sheets application access and the read-only development MCP, see [`google-sheets/SKILL.md`](google-sheets/SKILL.md).

For security reviews of agent workflows, prompt injection, or secret exposure, use [`mtms-security-guide/SKILL.md`](mtms-security-guide/SKILL.md) and its linked [`security-guide.md`](mtms-security-guide/security-guide.md), together with `.cline/workflows/security.md` and `AGENTS.md`. For NTE security review, also follow `docs/NTE_SECURITY_WORKFLOW.md`; it is guidance, not authorization to change code or run writes.

Discover available skills from the `SKILL.md` files in each skill directory; do not maintain fixed skill counts. Invoke a matching skill explicitly when needed.

Discover agent personas from `.agents/agents/*.md` and slash workflows from `.cline/workflows/*.md`. Consult `CLINE.md` for the current command index; only invoke workflows present in the directory.

When `.cline/rules/` and `.agents/rules/` disagree, apply the stricter applicable project/security rule, check `AGENTS.md` and the authoritative source named there, and avoid bulk-copying one directory over the other. Keep behaviorally relevant rule edits aligned in both locations and review their differences deliberately.

For explicitly approved standalone non-inventory PostgreSQL data-fix scripts, use `src/lib/db/execute.ts`, load `dotenv/config` before DB access, verify the target and rollback, and close the pool in `finally`. This helper does not authorize a write. Inventory mutations remain procedure/repository-only; schema changes use reviewed migrations. Read-only inspection uses the Postgres MCP. Do not create ad-hoc read scripts or infer approval to mutate production data.
