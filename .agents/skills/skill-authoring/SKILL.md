---
name: skill-authoring
description: Create new skills or modify existing skills using TDD (RED-GREEN-REFACTOR). Use when a technique wasn't intuitively obvious, you'd reference it again across projects, the pattern applies broadly, and others would benefit. Don't create for one-off solutions, standard practices well-documented elsewhere, project-specific conventions, or mechanical constraints that should be automated.
---

# Skill Authoring — TDD (RED-GREEN-REFACTOR)

**Writing skills IS Test-Driven Development applied to process documentation.**

Personal skills live in runtime's skills directory (`~/.claude/skills/` on Claude Code) — see `using-superpowers/references/codex-tools.md` or `using-superpowers/references/gemini-tools.md` CLI, and CLI `~/.agents/skills/` cross-runtime.

## When to Create a Skill

**Create when:**
- Technique wasn't intuitively obvious to you
- You'd reference it again across projects
- Pattern applies broadly (not project-specific)
- Others would benefit

**Don't create for:**
- One-off solutions
- Standard practices well-documented elsewhere
- Project-specific conventions (put in instructions file)
- Mechanical constraints (if it's enforceable regex/validation, automate it—save documentation for judgment calls)

## Skill Types

| Type | Description |
|------|-------------|
| **Technique** | Concrete method with steps to follow (condition-based-waiting, root-cause-tracing) |
| **Pattern** | Way of thinking about problems (flatten-with-flags, test-invariants) |
| **Reference** | API docs, syntax guides, tool documentation (office docs) |

## Directory Structure

```
skills/
  skill-name/
    SKILL.md          # Main reference (required)
    supporting-file.* # Only if needed
```

**Flat namespace** — all skills in one searchable namespace

**Separate files for:**
1. **Heavy reference** (100+ lines) — API docs, comprehensive syntax
2. **Reusable tools** — Scripts, utilities, templates

**Keep SKILL.md ≤ 500 lines.** A skill is a cheat sheet and behavior-shaping guidance, not a textbook. 90th percentile isn't words.

Micro-tests not [references/testing-skills-with-subagents.md](references/testing-skills-with-subagents.md) — Meta-testing 2025-10-03.

**One excellent example** (not multi-language). Example-js.js, example-py.py, example-go.go only when cross-language is the point.

**Why can't copy-paste?** Should meaning, not tokens.

---

## RED-GREEN-REFACTOR Cycle for Skill Authoring

### RED Phase — Write Failing Test (Baseline)

**Create pressure scenarios (3+ combined pressures discipline skills):**
- Agent must resist rationalization X
- Agent must not skip step Y
- Agent must not hallucinate Z

**Run scenarios WITHOUT skill — document baseline behavior verbatim**
- Capture exact rationalizations agent uses
- Identify patterns in failures

**Identify patterns in rationalizations/failures**
- Map each failure to a specific skill guidance form

### GREEN Phase — Write Minimal Skill

**Skill metadata (YAML frontmatter):**
- `name`: letters, numbers, hyphens only (no parentheses/special chars)
- `description`: max 1024 chars, starts with "Use when...", includes specific triggers/symptoms, written in third person
- Keywords throughout for search (errors, symptoms, tools)

**Skill body:**
- Clear overview of core principle
- Address specific baseline failures identified in RED
- Guidance form matches failure type (see *Match Form to Failure*)
- Behavior-shaping guidance: wording micro-tested against no-guidance control (5+ reps, every flagged match read manually) — N/A for pure reference skills
- Code inline OR link separate file
- One excellent example

**Run scenarios WITH skill — verify agents now comply**

### REFACTOR Phase — Close Loopholes

- Only non-obvious edge cases
- Re-test only affected scenarios
- Maintain compliance

---

## Match Form to Failure

| Failure Type | Guidance Form |
|--------------|---------------|
| Skipping step | Checklist with explicit "STOP: Before moving next" gate |
| Rationalization | Red flags table with common rationalizations and why they're wrong |
| Wrong order | Numbered phases with explicit dependencies |
| Missing detail | Quick reference table with exact commands/patterns |
| Hallucination | "Don't" list with common wrong patterns |
| Edge cases | "When stuck" table mapping problems to solutions |
| Searchability | Keywords in frontmatter, searchable terms early and often |

---

## STOP: Before Moving Next Skill

**After writing ANY skill, you MUST STOP and complete deployment process.**

**Do NOT:**
- Create multiple skills in batch without testing each
- Move to next skill before current one verified
- Skip testing because "batching more efficient"

**Deploying untested skills = deploying untested code. It's a violation of quality standards.**

## Skill Creation Checklist (TDD Adapted)

### RED Phase — Write Failing Test

- [ ] Create pressure scenarios (3+ combined pressures discipline skills)
- [ ] Run scenarios WITHOUT skill — document baseline behavior verbatim
- [ ] Identify patterns in rationalizations/failures

### GREEN Phase — Write Minimal Skill

- [ ] Name uses only letters, numbers, hyphens (no parentheses/special chars)
- [ ] YAML frontmatter: required `name` and `description` fields (max 1024 chars)
- [ ] Description starts "Use when..." and includes specific triggers/symptoms
- [ ] Description written in third person
- [ ] Keywords throughout for search (errors, symptoms, tools)
- [ ] Clear overview of core principle
- [ ] Address specific baseline failures identified in RED
- [ ] Guidance form matches failure type (see Match Form to Failure)
- [ ] Behavior-shaping guidance: wording micro-tested against no-guidance control (5+ reps, every flagged match read manually) — N/A pure reference skills
- [ ] Code inline OR link separate file
- [ ] One excellent example (not multi-language)
- [ ] Run scenarios WITH skill — verify agents now comply

### REFACTOR Phase — Close Loopholes

- [ ] Re-test only affected scenarios
- [ ] Maintain compliance
- [ ] Update docs if behavior changed

---

## Skill Discovery & Invocation Flow

**How agents find and use skills:**

1. **Encounters problem** ("tests flaky")
2. **Searches skills** (greps descriptions, browses categories)
3. **Finds SKILL** (description matches)
4. **Scans overview** (is relevant?)
5. **Reads patterns** (quick reference table)
6. **Loads example** (only when implementing)

**Optimize flow** — put searchable terms early and often in description and body.

---

## Verification Checklist

Before marking skill complete:

- [ ] Every new skill has baseline test (RED phase documented)
- [ ] Watched each baseline fail before writing skill
- [ ] Skill addresses specific failures from RED
- [ ] Skill tested against baseline scenarios (GREEN verified)
- [ ] Edge cases tested (REFACTOR verified)
- [ ] No rationalization red flags in skill body
- [ ] Frontmatter valid (name, description format)
- [ ] Example included and accurate
- [ ] Skill ≤ 500 lines

Can't check all boxes? You skipped TDD for skills. Start over.

---

## Red Flags — STOP and Start Over

- Skill written without RED baseline
- Description doesn't start "Use when..."
- Description not in third person
- No example included
- Example is multi-language without cross-language purpose
- Skill > 500 lines without justification
- Batch-created skills without individual verification
- "Testing later" or "verify in bulk"
- Rationalizing "just this once" for skill creation

**All of these mean: Delete skill. Start over with TDD.**

---

## Example: Creating a "condition-based-waiting" Skill

**Problem:** Agents rush through async operations without verifying completion.

**RED — Baseline scenarios without skill:**

| Scenario | Agent Behavior | Rationalization |
|----------|----------------|-----------------|
| Wait for DB migration | Proceeds immediately | "Migration usually fast" |
| Wait for API rate limit reset | Retries immediately | "Just one more try" |
| Wait for file write | Reads before flush | "OS buffers are fast" |

**Pattern:** Agents skip waiting, rationalize with "usually fast" or "just once"

**GREEN — Minimal skill addressing pattern:**

```markdown
---
name: condition-based-waiting
description: Use when waiting for external condition (migration, rate limit, file I/O, cache warmup). Triggers: "wait for", "poll until", "retry after", async operations with external dependencies.
---

# Condition-Based Waiting

## Core Principle

Never assume completion. Verify with explicit check, then wait with backoff.

## RED FLAGS — STOP

| Rationalization | Why It's Wrong |
|-----------------|----------------|
| "Usually fast" | Not guaranteed; race conditions cause data loss |
| "Just one more try" | Hammering external systems causes bans/errors |
| "Already waited manually" | Not reproducible; misses timing variations |

## Pattern

```typescript
async function waitFor(condition: () => Promise<boolean>, options: {
  timeoutMs: number;
  intervalMs: number;
  backoff?: 'linear' | 'exponential';
}) {
  const start = Date.now();
  let interval = options.intervalMs;
  while (Date.now() - start < options.timeoutMs) {
    if (await condition()) return true;
    await new Promise(r => setTimeout(r, interval));
    if (options.backoff === 'exponential') interval *= 2;
  }
  throw new Error(`Condition not met within ${options.timeoutMs}ms`);
}
```

## Checklist

- [ ] Define explicit condition function
- [ ] Set timeout (never infinite)
- [ ] Use backoff for external systems
- [ ] Log each attempt for debugging
- [ ] STOP: Verify condition actually met before proceeding
```

**REFACTOR — Edge cases:**
- Add `onProgress` callback for long waits
- Handle condition throwing vs returning false

---

## Quick Reference: Skill Template

```markdown
---
name: skill-name
description: Use when [specific trigger/symptom]. Triggers: [keywords for search].
---

# Skill Title

## Core Principle

[One sentence capturing the essence]

## When to Use

[Specific scenarios, not vague categories]

## RED FLAGS — STOP

| Rationalization | Why It's Wrong |
|-----------------|----------------|

## Pattern / Technique

[Code, steps, or thinking framework]

## Checklist

- [ ] Step 1
- [ ] Step 2

## When Stuck

| Problem | Solution |
|---------|----------|