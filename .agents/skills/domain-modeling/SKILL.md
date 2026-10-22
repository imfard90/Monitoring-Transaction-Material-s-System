---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording/editing an ADR. Not for merely reading glossary — that's a one-line habit. This skill is for when you're changing the model.
---

# Domain Modeling

**Goal:** Make the project's domain language precise, consistent, and decision-tracked. Challenge fuzzy terms, stress-test boundaries, capture decisions in GLOSSARY.md and ADRs.

## When to Use

- User uses term that may conflict with existing glossary
- User uses vague/overloaded terms ("account", "order", "transaction")
- Designing new feature — need to define domain boundaries
- Creating/updating ADR for architectural decision
- Cross-referencing code vs. stated behavior

**Don't use for:** Simply looking up a term (just read GLOSSARY.md).

---

## File Structure

### Single Context (most repos)
```
/
├── GLOSSARY.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

### Multiple Contexts (bounded contexts)
```
/
├── GLOSSARY-MAP.md          # Maps context → location
├── docs/
│   └── adr/                 # System-wide decisions
├── src/
│   ├── ordering/
│   │   ├── GLOSSARY.md
│   │   └── docs/adr/        # Context-specific decisions
│   └── billing/
│       ├── GLOSSARY.md
│       └── docs/adr/
```

**Create lazily:** Only when first term resolved or first ADR needed.

---

## During Session: Active Discipline

### 1. Challenge Against Glossary

When user uses term conflicting with `GLOSSARY.md`:

> "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### 2. Sharpen Fuzzy Language

When user uses vague terms:

> "You're saying 'account': do you mean the Customer or the User? Those are different things."

### 3. Discuss Concrete Scenarios

Stress-test relationships with specific edge cases:

> "What happens if a Technician is assigned to two Warehouses simultaneously?"
> "Can a Material Request be partially fulfilled? What status then?"

Force precision on boundaries.

### 4. Cross-Reference with Code

When user states behavior, check code:

> "Your code cancels entire Orders, but you said partial cancellation is possible. Which is right?"

Surface contradictions immediately.

### 5. Update GLOSSARY.md Inline

When term resolved, update **right there**. Don't batch.

**Format** (`GLOSSARY-FORMAT.md`):
```markdown
## Term

**Definition:** [Precise, unambiguous definition]

**Context:** [Bounded context if multiple]

**Synonyms:** [Alias terms used in code/docs]

**Related:** [Links to related terms]

**Decision:** [ADR reference if term emerged from decision]
```

**GLOSSARY.md is ONLY a glossary.** No implementation details, no specs, no scratchpad.

### 6. Offer ADRs Sparingly

Create ADR **only when all three true**:

1. **Hard to reverse** — cost of changing mind later is meaningful
2. **Surprising without context** — future reader asks "why this way?"
3. **Real trade-off** — genuine alternatives existed, picked one for specific reasons

**Format** (`ADR-FORMAT.md`):
```markdown
# ADR XXXX: [Title]

**Status:** Proposed | Accepted | Superseded

## Context

What problem forced this decision?

## Decision

What was chosen.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| A | ... |
| B | ... |

## Consequences

### Positive
- ...

### Negative
- ...

## Related
- GLOSSARY: [Term]
- ADR: [XXXX]
```

---

## Verification Checklist

Before marking domain modeling complete:

- [ ] Every new/clarified term in GLOSSARY.md (format followed)
- [ ] No implementation details in glossary
- [ ] ADR created only when 3 criteria met
- [ ] ADR follows format, includes alternatives table
- [ ] Code cross-referenced — no unresolved contradictions
- [ ] Fuzzy terms sharpened with concrete scenarios
- [ ] If multi-context: GLOSSARY-MAP.md updated

---

## Red Flags — STOP

- Adding to glossary without code cross-reference
- Writing ADR for reversible/low-stakes decision
- Treating glossary as spec or implementation doc
- Batching glossary updates ("I'll do it later")
- Creating term without concrete scenario stress-test
- ADR without alternatives table
- GLOSSARY-MAP.md missing in multi-context repo

---

## MTMS Integration

**Current MTMS glossary terms (examples):**
- `Header` / `Detail` — inventory transaction structure
- `PIC` — Person In Charge (warehouse mapping)
- `End Status` — transaction lifecycle state
- `WO Lensa Ref` / `Out Lensa Ref` — specific transaction types
- `Idempotency Key` — deduplication token for mutations

**ADR locations:** `docs/adr/` (see `docs/adr/README.md` for index)

**When modeling MTMS domains:**
- Always check `inventory` schema stored procedures for actual behavior
- Cross-reference `hr` schema for technician/branch data
- Verify `auth` schema (Better Auth) for role definitions
- Use `bispro.md` for business process flows