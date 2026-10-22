---
name: handoff
description: Compact current conversation into a handoff document for another agent to pick up. User-invoked only (disable-model-invocation: true). Argument: "What will the next session be used for?" Use when switching contexts, ending session, or passing work to another agent/human.
disable-model-invocation: true
argument-hint: "What will the next session be used for?"
---

# Handoff

**Goal:** Create a compact, actionable handoff document so a fresh agent (or human) can continue work without re-reading entire conversation.

## When to Use

- Ending a session with incomplete work
- Switching to different task/agent
- Passing work to colleague
- "Save progress and continue later"

---

## Process

### 1. Gather Context

From current conversation, extract:
- **Objective**: What was the goal?
- **Progress**: What's done, what's in progress, what's blocked
- **Decisions Made**: Key choices with rationale
- **Open Questions**: Unresolved items
- **Artifacts**: Files created/modified, specs, ADRs, research docs
- **Next Steps**: Concrete, ordered actions

### 2. Write Handoff Document

Save to OS temp directory (`$TMPDIR`/`/tmp`/`%TEMP%`), **not workspace**.

```markdown
# Handoff: [Brief Topic]

**Date:** [YYYY-MM-DD]
**Session:** [Brief ID or timestamp]
**Next Session Focus:** [From argument hint]

---

## Objective
[One paragraph: what we're trying to achieve]

---

## Progress Summary

### Done
- [ ] [Completed item with file/link reference]

### In Progress
- [ ] [Current item] — [Status/Blocker]

### Blocked
- [ ] [Blocked item] — [Waiting on what/whom]

---

## Key Decisions (with Rationale)

| Decision | Rationale | ADR/Ref |
|----------|-----------|---------|
| [What] | [Why] | [Link] |

---

## Open Questions
1. [Question] — [Context/Where to find answer]
2. ...

---

## Artifacts Created/Modified

| File | Purpose | Status |
|------|---------|--------|
| `src/...` | [What it does] | [Done/WIP] |
| `docs/adr/...` | [Decision] | [Proposed/Accepted] |
| `research/...` | [Findings] | [Complete] |

---

## Suggested Skills for Next Agent

Next agent should call Skill tool for:
- `skill-name` — [Why needed for next steps]
- `skill-name` — [Why needed]
...

---

## Next Steps (Ordered)

1. [Specific action] — [File/Context] — [Expected outcome]
2. [Specific action] — [File/Context] — [Expected outcome]
3. ...

---

## Redacted / Sensitive

[Confirm no API keys, passwords, PII, tokens in this doc. If any were discussed, note they're in env/secrets manager, not here.]
```

---

## Verification Checklist

Before saving handoff:

- [ ] Objective clear in one paragraph
- [ ] Progress: Done/In Progress/Blocked with references
- [ ] Decisions table with rationale + links
- [ ] Open questions specific and actionable
- [ ] Artifacts table with file paths and status
- [ ] **Suggested skills** listed with reasoning
- [ ] Next steps ordered and concrete
- [ ] No sensitive data included
- [ ] Saved to temp directory (not workspace)

---

## Red Flags — STOP

- Handoff written without "Next Session Focus" argument
- Vague next steps ("continue work")
- Missing suggested skills
- Sensitive data in document
- Saved to workspace instead of temp
- Duplicating content already in ADRs/specs/research (reference instead)

---

## Integration

- **Input from**: `grill-me` output (decision tree), `domain-modeling` (glossary/ADR refs), `research` (findings files)
- **Output feeds**: Next session's `grill-me`, `writing-plans`, `two-axis-code-review`
- **Pairs with**: `to-questionnaire` (if handoff includes questions for external stakeholder)

---

## MTMS Notes

- Reference `AGENTS.md` section numbers for authz/business rules
- Reference `bispro.md` for business process flow IDs
- Reference `docs/adr/` index for architectural decisions
- Mention active migration runner status if DB changes pending