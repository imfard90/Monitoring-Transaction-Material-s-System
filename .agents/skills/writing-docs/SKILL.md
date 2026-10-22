---
name: writing-docs
description: Writing documents agents can read and use: skills, AGENTS.md/CLAUDE.md, ADRs, GLOSSARY.md, and any doc agents reach by pointer. Use when creating or updating agent-facing documentation.
---

# Writing for Agents

## Overview

**Agents read differently than humans.** They scan for: frontmatter, headings, code blocks, checklists, and cross-references. Prose paragraphs are low-signal.

**Principle:** Write for the agent that will execute the task, not the human who requested it.

## Document Types & Templates

### 1. Skill (`SKILL.md`)
**Location:** `.agents/skills/<bucket>/<name>/SKILL.md`

**Required frontmatter:**
```yaml
---
name: kebab-case-name
description: One sentence starting with "Use when..." including specific triggers/symptoms
---
```

**Structure:**
1. **Overview** — Core principle in 2-3 sentences
2. **When to use** — Concrete triggers (not vague "when needed")
3. **Process/Method** — Numbered steps with success criteria
4. **Anti-patterns** — Table: pattern → symptom → fix
5. **MTMS Integration** — Project-specific application
6. **Red Flags** — Checklist to stop and reassess
7. **Cross-refs** — Links to related skills, rules, workflows

### 2. AGENTS.md / CLAUDE.md
**Location:** Repo root or `.agents/`

**Structure:**
1. **Priority hierarchy** — Safety > user instructions > repo rules
2. **Absolute principles** — Non-negotiable rules (P0/P1)
3. **Workflow** — Numbered steps with verification
4. **Code specifics** — Structure, security, DB, components
5. **Definition of Done** — Checklist

### 3. ADR (`docs/adr/NNN-title.md`)
**Location:** `docs/adr/` with sequential numbering

**Format (from TEMPLATE.md):**
```markdown
# NNN: Title

## Status
Proposed | Accepted | Superseded

## Context
What problem, what constraints, what triggered this

## Decision
What we're doing, unambiguously

## Alternatives Considered
| Option | Pros | Cons |
|--------|------|------|

## Consequences
### Positive
### Negative
### Risks & Mitigations

## Implementation Notes
Links to code, migrations, configs
```

**Criteria (all 3 must be true):**
1. Hard reverse — costly to change later
2. Surprising without context — future reader asks "why?"
3. Real trade-off — genuine alternatives with specific reasons

### 4. GLOSSARY.md
**Location:** Repo root or per-context (`src/<domain>/GLOSSARY.md`)

**Entry format:**
```markdown
## Term

**Definition:** One-sentence precise meaning

**Context:** Where/how used in MTMS

**Synonyms:** Aliases, related terms

**Related:** Cross-refs to other terms

**Decision:** ADR reference if term embodies architectural choice
```

**Rules:**
- Zero implementation details
- Not a spec or scratchpad
- Pure vocabulary — definitions only

### 5. Skill Reference / Workflow Doc
**Location:** `.cline/workflows/` or `.agents/skills/<name>/`

**Structure:**
1. **Purpose** — One sentence
2. **When to run** — Trigger conditions
3. **Steps** — Numbered, each with verification
4. **Expected output** — What "done" looks like
5. **Troubleshooting** — Common failures and fixes

## Agent-Reading Patterns

Agents optimize for:

| Pattern | Agent Value | Human Value |
|---------|-------------|-------------|
| **Frontmatter** | Instant skill matching | Metadata |
| **Headings** | Section navigation | Scanning |
| **Code blocks** | Copy-paste execution | Reference |
| **Checklists** | Progress tracking | Verification |
| **Tables** | Dense comparison | Decision aid |
| **Cross-refs** | Dependency graph | Navigation |

**Write to maximize these.** Minimize narrative paragraphs.

## Frontmatter Standards

| Doc Type | Required Fields |
|----------|-----------------|
| Skill | `name`, `description` |
| ADR | None (numbered filename) |
| GLOSSARY | None |
| Workflow | None |
| Rule | None |

**Description field must:**
- Start with "Use when..." or "Use for..."
- Include specific triggers/symptoms
- Be searchable (keywords: error names, tool names, patterns)
- Third person ("Use when..." not "I use when...")

## MTMS Integration

- **Skills** → `.agents/skills/` (canonical) + `.cline/rules/` (copies)
- **Rules** → `.agents/rules/common-*.md` (canonical)
- **Workflows** → `.cline/workflows/*.md` (CLI entry points)
- **ADRs** → `docs/adr/NNN-*.md` (linked from `docs/adr/README.md`)
- **GLOSSARY** → Repo root + per-domain in `src/<domain>/`

## Red Flags

- [ ] Skill description doesn't start with "Use when..."
- [ ] ADR written for decision that isn't hard-reverse/surprising/trade-off
- [ ] GLOSSARY entry contains implementation details
- [ ] Document has >3 paragraphs without heading/code-block/table
- [ ] Cross-ref points to non-existent file
- [ ] Frontmatter missing or malformed

## Quality Checklist

Before committing any agent-facing doc:

- [ ] Frontmatter valid (YAML parses, required fields present)
- [ ] All cross-references resolve to existing files
- [ ] Code blocks are copy-paste executable
- [ ] Checklists have actionable items with clear done criteria
- [ ] Tables use consistent column structure
- [ ] No em-dashes (use comma, colon, period, parentheses, conjunction)
- [ ] MTMS-specific references accurate (paths, commands, schemas)