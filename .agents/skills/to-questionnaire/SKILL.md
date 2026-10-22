---
name: to-questionnaire
description: Turn a decision you can't fully answer into a questionnaire for someone else to fill in. User-invoked only (disable-model-invocation: true). Use when user lacks context/expertise and needs input from a specific person (stakeholder, domain expert, infra team, etc.).
disable-model-invocation: true
---

# To Questionnaire

**Goal:** Create a targeted questionnaire that pulls the exact knowledge the user needs from the person who has it. The questionnaire is a Markdown file the recipient fills in.

## When to Use

- "I need [person] to tell me X so I can decide Y"
- "Ask the infra team about [constraint]"
- "Get clarification from product on [requirement]"
- "Need DBA input on [migration approach]"

**Not for:** Internal clarification (use `grill-me` or `wait-what`).

---

## Core Principle: Grill the Send, Not the Subject

Interview the **user** only about the **send** — they can always answer:
1. **Who is it going to?** (Role, expertise, relationship)
2. **What do you need back?** (Specific decisions/facts)

The **questions** then target the **gap** between what recipient knows and user needs.

---

## Process

### Step 1: Who Is It Going To? (One Exchange)

Ask user:
- Recipient's role/title
- Their expertise area
- Relationship to user (peer, stakeholder, approver, external)
- What context they already have vs. need

**Done when:** You know recipient and what they know that user doesn't.

### Step 2: What Do You Need Back? (One Exchange)

Ask user for **concrete list** of decisions/facts they must walk away able to make.

Examples:
- "Whether we can use WebSocket on current infra"
- "Exact Postgres version and extension availability"
- "Business rule for partial fulfillment edge case"
- "Approval flow for budget > $10k"

**Done when:** Every item is specific, decision-oriented, and the user confirms "if I had these answers, I could proceed."

### Step 3: Write Questionnaire

Draft questions aimed at the **gap** from Steps 1–2.

**Output:** `to-questionnaire-<slug>.md` in current directory (slug from topic).

---

## Document Structure

```markdown
# Questionnaire: [Title]

**Purpose:** [Why this exists — the decision riding on it]

**From:** [User name/role]  **To:** [Recipient name/role]  **How answers will be used:** [Where they go — PR, ADR, spec, implementation]

---

## Context

[One paragraph orienting recipient who wasn't in user's head. Enough to answer well, not a page.]

---

## How to Answer

**Deadline:** [Date]  **Rough effort:** [e.g., "15-30 min"]

- Partial answers and "I don't know" are useful — flag unsure items rather than skipping
- Answer directly under each question
- Return filled file to [user/channel]

---

## [Theme Heading]

[One `##` section per theme. Questions most-important-first.]

### Question 1: [Specific, single-idea question]

_Why this matters: [One line only where question could be misread or invite throwaway answer]_

> [Answer stub]

### Question 2: [Next most important]

_Why this matters: ..._

> [Answer stub]

---

## [Theme Heading 2]
...

---

## Anything Else?

[A closing catch-all: anything we didn't ask that we should know?]

> [Answer stub]
```

---

## Question Design Rules

| Rule | Why |
|------|-----|
| One idea per question | Compound questions get partial answers |
| Most important first | Async = may only get one pass |
| "Why this matters" only where needed | Reduces noise; recipient sees intent |
| Answer stub directly under | Reduces friction, keeps format |
| Flag uncertainty explicitly | "I don't know" > silence |
| Theme grouping (`##`) when >5 questions | Cognitive chunking |

---

## Verification Checklist

Before saving questionnaire:

- [ ] Purpose states the decision riding on it
- [ ] Recipient identified with role/expertise
- [ ] Context paragraph sufficient for cold reader
- [ ] Deadline and effort estimate included
- [ ] Questions target the gap (not what user already knows)
- [ ] One idea per question, most important first
- [ ] Theme grouping if >5 questions
- [ ] Answer stubs under each question
- [ ] Closing catch-all included
- [ ] File saved as `to-questionnaire-<slug>.md` in repo

---

## Red Flags — STOP

- Writing questionnaire without confirming recipient and needed answers first
- Questions user could answer themselves
- Compound questions ("What are the pros and cons of X and Y?")
- No "Why this matters" on ambiguous questions
- Questionnaire not saved in repo (lost in chat)
- User treats it as "ask them to review" instead of "extract specific knowledge"

---

## Integration

- **Input from**: `grill-me` (parking lot questions), `handoff` (open questions), `domain-modeling` (glossary terms for recipient)
- **Output feeds**: User fills → `domain-modeling` (new terms/ADRs), `writing-plans` (implementation), `two-axis-code-review` (spec alignment)
- **Async workflow**: User sends → Recipient fills → User receives → Next action

---

## MTMS Example

**User needs DBA input on migration strategy for `inventory` schema changes.**

**Send:** To: DBA (Postgres expert, manages prod). Need: "Which migration approach for adding `reconciliation_status` column to `inventory.material_movements`?"

**Questionnaire:**
```markdown
# Questionnaire: Migration Strategy for inventory.material_movements

**Purpose:** Decide migration approach for new reconciliation_status column (blocking feature X)

**From:** Backend Engineer  **To:** DBA  **How answers used:** ADR 0015, migration script

## Context
Adding `reconciliation_status` enum column to 50M-row table. Zero-downtime required. Current PG 15.3.

## How to Answer
Deadline: Friday EOD. Effort: 15 min.

## Migration Approach

### Q1: Can we use `ALTER TABLE ... ADD COLUMN` with default, then backfill in batches?

_Why this matters: Simplest approach; need to know if table locks are acceptable._

> 

### Q2: If not, is `pg_repack` or logical replication preferred for this table?

_Why this matters: Determines tooling/infra prep needed._

> 

## Anything Else?
> 
```