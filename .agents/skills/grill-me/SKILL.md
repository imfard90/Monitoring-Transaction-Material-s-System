---
name: grill-me
description: A relentless interview to sharpen a plan or design. User-invoked only (disable-model-invocation: true). Use when user says "grill me on this plan", "interview me about this design", or wants to stress-test a decision before committing.
disable-model-invocation: true
---

# Grill Me

**Goal:** Interview the user until the design tree is resolved — no vague hand-waving, no unexamined assumptions. Every branch of the decision must be articulated and defended.

## When to Use

- "Grill me on this plan"
- "Interview me about this design"
- "Stress-test this decision"
- User presents a plan with gaps, vague language, or unexamined trade-offs

**Not for:** Casual clarification. This is adversarial by design.

---

## Process

### 1. Map the Decision Tree

Ask user to articulate the **entire decision tree**, not just the happy path:

```
Decision: [What are we deciding?]

Branch A: [Option 1]
  - Assumptions: [...]
  - Risks: [...]
  - Cost: [...]
  - Reversibility: [...]

Branch B: [Option 2]
  ...

Branch C: [Option 3]
  ...

Rejected: [What was considered and dropped? Why?]
```

### 2. Grill Each Branch

For **every branch**, ask:

| Area | Questions |
|------|-----------|
| **Assumptions** | "What must be true for this to work?" "How do you know X is true?" "What if X is false?" |
| **Risks** | "What's the worst case?" "Probability?" "Mitigation?" "Can we detect it early?" |
| **Cost** | "Time?" "Complexity?" "Maintenance burden?" "Opportunity cost?" |
| **Reversibility** | "One-way or two-way door?" "Rollback plan?" "Blast radius if wrong?" |
| **Dependencies** | "What else must be true?" "External deps?" "Team capacity?" |
| **Success Criteria** | "How do we know it worked?" "Metrics?" "Timeline?" |

### 3. Challenge Fuzzy Language

When the user says:
- "It should be fast" → "Define fast. p50? p99? Under what load?"
- "We'll handle errors" → "Which errors? How? Retry? Dead letter? Alert?"
- "Standard approach" → "Whose standard? Link to doc."
- "Best practice" → "Cite source. Version. Context match?"

### 4. Force Trade-off Articulation

No "best of both worlds." Make the user pick:

> "You want X and Y. They conflict on [dimension]. Which do you optimize for, and what do you accept losing?"

### 5. Red Team the Happy Path

- "What breaks first at 10x load?"
- "What happens when [dependency] is down?"
- "What if the migration fails halfway?"
- "What if the requirement changes in 3 months?"
- "What did we forget?"

### 6. Document the Resolved Tree

Output a **Decision Record** (not ADR — this is pre-decision):

```markdown
# Grill Session: [Topic]

**Date:** [YYYY-MM-DD]
**Decision:** [What was being decided]

## Resolved Decision Tree

### Chosen: [Branch X]
**Rationale:** [User's articulated reasoning]

### Rejected Alternatives
| Option | Why Rejected |
|--------|--------------|
| A | ... |
| B | ... |

### Explicit Trade-offs Accepted
| Trade-off | Accepted Cost |
|-----------|---------------|
| X for Y | [Specific cost] |

### Assumptions Validated
- [Assumption] → [Evidence/Confidence]

### Risks Acknowledged
| Risk | Probability | Mitigation | Detection |
|------|-------------|------------|-----------|
| ...  | ...         | ...        | ...       |

### Open Questions (Parking Lot)
- [Questions that need external input]
```

---

## Verification Checklist

Before ending grill session:

- [ ] Full decision tree mapped (all branches)
- [ ] Every branch grilled on assumptions, risks, cost, reversibility
- [ ] Fuzzy language eliminated — all terms precise
- [ ] Trade-offs explicitly articulated (no "both")
- [ ] Happy path red-teamed (failure scenarios)
- [ ] Decision Record produced with all sections
- [ ] User can articulate "why not X" for every rejected option

---

## Red Flags — STOP (End Session)

- User refuses to articulate assumptions ("it is obvious")
- User rejects trade-off framing ("I want both")
- User gives vague success criteria ("it works")
- Session exceeds 30 min without progress — pause, use `to-questionnaire`
- User treats grill as validation seeking, not stress-testing

---

## Integration with Other Skills

- **Output feeds** → `to-questionnaire` (for external input needed)
- **Output feeds** → `domain-modeling` (terms → GLOSSARY, decisions → ADR)
- **Output feeds** → `two-axis-code-review` (Spec axis: does code match grilled decision?)
- **Precedes** → `writing-plans` (detailed implementation plan after grill)

---

## MTMS Example

**User:** "I want to add real-time stock updates via WebSocket"

**Grill branches:**
1. WebSocket vs SSE vs polling
2. Auth for WebSocket (cookie? token? how refresh?)
3. Reconnection logic (exponential backoff? max retries?)
4. Server scaling (sticky sessions? Redis pub/sub?)
5. Client state sync (optimistic? server-authoritative?)
6. Fallback when WS fails

**Each branch grilled** until decision tree resolved with explicit trade-offs.