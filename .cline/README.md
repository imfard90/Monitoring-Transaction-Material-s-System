# Cline Configuration for MTMS

This directory contains Cline AI agent configuration for the MTMS project.

## Directory Structure

```
.cline/
├── README.md           # This file
├── rules/              # 29 coding standards and patterns
├── workflows/          # 6 slash command workflows
├── skills/             # Project-specific skills (optional)
├── hooks/              # Lifecycle hooks (optional)
└── agents/             # Custom agent definitions (optional)
```

## Quick Reference

### Workflows (Slash Commands)

Invoke with `/workflow-name`:

- `/commit` — Commit and push with conventional commit message
- `/review` — Full code review (tsc + Biome + React/TS/security)
- `/security` — Security audit (OWASP Top 10 + mtms-security-guide)
- `/db-check` — Query DB via MCP, validate Kysely types
- `/perf` — React/Next.js performance audit
- `/new-page` — Scaffold new dashboard page + sidebar wiring

### Rules

Rules automatically load based on file patterns. All 29 rules support conditional activation via frontmatter paths.

**Categories**:
- Common (6 rules) — Apply to all files
- TypeScript (4 rules) — Apply to `.ts`/`.tsx` files
- React (5 rules) — Apply to `.tsx`/`.jsx` files
- Web (5 rules) — Apply to web-related files

Toggle rules in Cline's Rules panel (scale icon → Rules tab).

### Skills

Skills are auto-discovered from `.agents/skills/` (203 total).

**MTMS-specific**:
- `mtms-create-page` — Create dashboard page
- `mtms-change-branding` — Rebrand app
- `better-auth` — Auth configuration
- `mtms-security-guide` — Security guide

Invoke explicitly with `/skill-name` or let Cline auto-trigger based on description.

## Getting Started

1. Install Cline extension in VS Code
2. Configure MCP server (see `MIGRATION.md`)
3. Read `CLINE.md` for full documentation
4. Try a workflow: `/db-check`

## Documentation

- **CLINE.md** — Complete Cline configuration guide
- **MIGRATION.md** — Migration guide from Roo/Claude
- **AGENTS.md** — Original agent instructions (cross-tool compat)
- **bispro.md** — Business process documentation (MANDATORY)

## Support

- **Technical Issues**: Check `MIGRATION.md` troubleshooting section
- **Configuration**: See `CLINE.md`
- **Business Logic**: Read `bispro.md`

---

**Version**: 1.0.0  
**Last Updated**: 2026-10-09
