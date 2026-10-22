# 004: Codebase Memory MCP Adoption

## Status
Accepted

## Context
- Large codebase (~50k+ lines) causes context window pressure
- Repeated `grep`/`read` cycles for same patterns across sessions
- Agent forgets cross-file relationships, architectural decisions between turns
- Existing read-only MCPs (PostgreSQL, Google Sheets) don't cover codebase semantics
- Need: semantic recall of code patterns, decisions, and conventions without re-reading

## Decision
Add `deus-codebase-memory` MCP server to `.mcp.json` for project-scoped semantic indexing and search.

Configuration in `.mcp.json`:
```json
{
  "mcpServers": {
    "deus-codebase-memory": {
      "command": "npx",
      "args": ["-y", "@deusdata/codebase-memory-mcp@latest"],
      "env": {}
    }
  }
}
```

Tools exposed (prefixed `mcp__deus-codebase-memory__`):
- `index_codebase` — Initial full indexing
- `search_code` — Semantic search by intent/pattern
- `get_file_summary` — AI-generated file summary
- `get_symbol_info` — Symbol definition + references

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Local vector DB (LanceDB/Chroma)** | Full control, no external dep | Maintenance burden, custom integration |
| **Cline memory plugin** | Native integration | Limited to Cline, no cross-agent portability |
| **gitingest / repomix** | One-off context packing | Not queryable, stale after edits |
| **Additional Context7 queries** | High-quality docs | Only covers public libraries, not project code |

## Consequences

### Positive
- Semantic search: "find inventory mutation pattern" → returns relevant SPs + repositories + actions
- Cross-session recall: decisions, patterns, conventions persist
- Faster onboarding: new agent sessions start with indexed knowledge
- Reduces `grep`/`read` cycles by ~60% (estimated)

### Negative
- Cold-start: initial index takes 30-120s on first run
- Runtime overhead: `npx` resolves package on each MCP spawn
- External dependency: `@deusdata/codebase-memory-mcp` must remain maintained
- Index staleness: requires re-index after significant changes

### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Index drift | Run `index_codebase` after major refactors; add to `/review` workflow |
| Package disappearance | Pin version in `.mcp.json` args; vendor if critical |
| Privacy leakage | MCP runs locally; no code uploaded; verify via network inspection |
| Over-reliance | Keep `grep`/MCP Postgres as primary; memory = complement |

## Implementation Notes

1. **Initial index:** Run `mcp__deus-codebase-memory__index_codebase` with workspace path
2. **Verification:** `search_code` with known patterns (e.g., "stored procedure inventory mutation")
3. **Workflow integration:** Add re-index step to `.cline/workflows/review.md` post-merge
4. **Documentation:** Update `.agents/rules/common-agents.md` Tooling section with MCP entry
5. **ADR checkpoint:** Review at 30 days — if unused, remove

## Related
- ADR 003: Agent Skills Adoption (skills that use this MCP)
- `.mcp.json` — MCP server configuration
- `setup-cline-mcp.sh` — Setup script for Cline MCP settings