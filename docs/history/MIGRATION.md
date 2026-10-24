# Migration Guide: Roo/Claude → Cline

## Overview

This guide documents the migration from Roo Cline extensions to native Cline configuration for the MTMS project.

**Migration Date**: October 9, 2026  
**Status**: ✅ Complete

## What Was Migrated

### ✅ Rules (29 files)
**Source**: `.agents/rules/`  
**Destination**: `.cline/rules/`  
**Action**: Copied all rule files

Cline recognizes the same YAML frontmatter format with conditional path-based activation.

### ✅ Workflows (6 workflows)
**Source**: `.roo/commands/`  
**Destination**: `.cline/workflows/`  
**Action**: Converted and enhanced

| Original Roo Command | New Cline Workflow | Changes |
|---------------------|-------------------|---------|
| `commit.md` | `commit.md` | Same format, invoke with `/commit` |
| `review.md` | `review.md` | Enhanced with agent loading |
| `security.md` | `security.md` | Enhanced with skill loading |
| `db-check.md` | `db-check.md` | Simplified MCP usage |
| `perf.md` | `perf.md` | Same format |
| `new-page.md` | `new-page.md` | Same format |

**Invocation**: Type `/workflow-name` in chat (e.g., `/commit`, `/review`)

### ✅ Skills (200+ skills)
**Source**: `.agents/skills/`  
**Destination**: `.agents/skills/` (no change)  
**Action**: None needed — Cline auto-reads from this directory

Cline natively supports the `.agents/skills/` directory and recognizes `SKILL.md` files with YAML frontmatter.

MTMS-specific skills remain in `.agents/skills/`:
- `mtms-create-page/`
- `mtms-change-branding/`
- `better-auth/`
- `mtms-security-guide/`

### ✅ MCP Configuration
**Source**: `.roo/mcp.json` (project-level)  
**Destination**: `~/.cline/data/settings/cline_mcp_settings.json` (global)  
**Action**: Manual setup required (see below)

Cline stores MCP configuration globally, not per-project.

### ⚠️ Custom Modes (9 modes)
**Source**: `.roomodes`  
**Destination**: Workflows + documentation  
**Action**: Converted mode instructions to workflows and `CLINE.md`

Roo's custom modes don't have a direct Cline equivalent. The mode definitions have been:
1. Converted to workflows where applicable
2. Documented in `CLINE.md` for manual invocation via prompts
3. Preserved in `.roomodes` for reference

**Workaround**: Use natural language prompts:
- Instead of "vibecode" mode: "Implement this feature using MTMS conventions, skip planning"
- Instead of "db-architect" mode: "Design database schema with Kysely types and migrations"
- Instead of "security-audit" mode: `/security` workflow

## Setup Instructions

### 1. Install Cline Extension
```bash
# VS Code
code --install-extension saoudrizwan.claude-dev
```

### 2. Configure MCP Server (REQUIRED)

**Location**: `~/.cline/data/settings/cline_mcp_settings.json`

**Steps**:
1. Open Cline settings in VS Code (scale icon → Settings)
2. Navigate to MCP configuration
3. Add this configuration:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://imam:[PASSWORD]@192.168.196.140:5432/gresik?sslmode=disable"
      ],
      "disabled": false,
      "alwaysAllow": ["query"]
    }
  }
}
```

**Security**: Replace `[PASSWORD]` with actual database password from `.env`.

### 3. Verify Rules Are Loaded

1. Open Cline panel in VS Code
2. Click scale icon → Rules tab
3. Should see 29 rules from `.cline/rules/`
4. Toggle rules on/off as needed

### 4. Test Workflows

Try: `/db-check` — should execute database health check

### 5. Test Skills

Try: `/mtms-create-page` — should load skill

## Verification Checklist

- [ ] Cline extension installed
- [ ] MCP postgres configured
- [ ] Rules visible (29 rules)
- [ ] Workflows invokable (6 workflows)
- [ ] Skills discovered (200+)
- [ ] `/db-check` works
- [ ] `/review` works
- [ ] `CLINE.md` reviewed

## Key Differences: Roo vs Cline

| Feature | Roo | Cline | Notes |
|---------|-----|-------|-------|
| Rules | `.agents/rules/` | `.cline/rules/` or `.agents/rules/` | Both work |
| Workflows | `.roo/commands/` | `.cline/workflows/` | New location |
| Skills | `.agents/skills/` | `.cline/skills/` or `.agents/skills/` | Both work |
| MCP Config | `.roo/mcp.json` | `~/.cline/data/settings/` | Global only |
| Custom Modes | `.roomodes` | No equivalent | Use prompts |

## Troubleshooting

**Rules Not Loading**: Reload VS Code window, verify `.cline/rules/` exists

**Workflows Not Appearing**: Check `.cline/workflows/*.md` have `description` frontmatter

**MCP Postgres Fails**: Verify `~/.cline/data/settings/cline_mcp_settings.json`, test DB connection

**Skills Not Triggering**: Verify `.agents/skills/` has valid `SKILL.md` files, try explicit `/skill-name`

## Rollback Plan

If issues arise:
1. Keep using Roo extension
2. `.roo/` directory preserved
3. `.agents/` directory preserved
4. No destructive changes made

## Next Steps

1. Team training on Cline workflows
2. Update wiki with Cline instructions
3. Archive `.roo/` after 2-4 weeks
4. Monitor issues

---

**Status**: ✅ Production Ready  
**Date**: 2026-10-09
