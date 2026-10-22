---
name: wait-what
description: Re-pitch context in plain English using GLOSSARY vocabulary when a message doesn't land. Use when stakeholder confused, requirements ambiguous, or agent-human alignment broken. Forces shared mental model before continuing.
---

# Wait-What

## Overview

**Wait-what IS a context reset.** When communication fails, stop. Don't rephrase — restructure.

**Core principle:** If they don't understand, your model of their understanding is wrong. Fix the model, not the words.

## When to Trigger

- Stakeholder asks "wait, what?" or equivalent confusion signal
- Agent produces output that clearly misses the mark
- Requirements discussion goes in circles >2 rounds
- Technical terms used without shared definition
- "Yes" but follow-up reveals misunderstanding

## Process

### 1. Stop immediately
- No more implementation, no more explaining
- Acknowledge the gap: "We're not aligned. Let me re-pitch."

### 2. Identify the concept gap
- What term, assumption, or model is misaligned?
- Check `GLOSSARY.md` — is the term defined?
- Is there an ADR that explains the "why"?

### 3. Re-pitch in plain English
**Structure:**
```
Concept: [term from GLOSSARY or new term]
Plain meaning: [one sentence, no jargon]
Why it matters: [business/technical impact]
Example: [concrete MTMS scenario]
Boundary: [what this does NOT mean]
```

### 4. Verify understanding
- Ask: "Does this match your mental model?"
- Ask stakeholder to re-pitch back in their words
- If mismatch → repeat from step 2

### 5. Document if new
- If term missing from GLOSSARY → add it
- If assumption not in ADR → consider ADR
- Update shared vocabulary

## Anti-Patterns

| Anti-Pattern | Symptom | Fix |
|--------------|---------|-----|
| **Rephrasing jargon** | "Let me explain differently" but same terms | Use GLOSSARY definitions; invent plain analogies |
| **Skipping verification** | "OK, moving on" without confirmation | Require stakeholder re-pitch |
| **No concrete example** | Abstract only | MTMS-specific scenario every time |
| **Blaming audience** | "They should know this" | Your job to align |

## MTMS Integration

- **GLOSSARY.md** at repo root + per-domain in `src/<domain>/`
- **ADRs** in `docs/adr/` explain architectural "why"
- **Skills** in `.agents/skills/` define process vocabulary
- **Rules** in `.agents/rules/` define constraint vocabulary

**Common MTMS terms that need wait-what:**
- `id_trx` vs `headerId` vs `sap_out_id`
- `formatted_date` (Lensa Ref) vs `created_at` vs `request_time`
- `warehouseIds` (Staff scope) vs `pic_1`/`pic_2` (PIC scope)
- `appr_api` gate vs API key validity
- `nextval` sequence vs `COUNT(*)` anti-pattern

## Red Flags — Stop and Wait-What

- [ ] Using term not in GLOSSARY
- [ ] Stakeholder says "OK" but next question reveals gap
- [ ] Third explanation attempt for same concept
- [ ] Implementation started without verified alignment
- [ ] "Standard practice" used to avoid explaining MTMS-specific meaning

## Output Format

When wait-what triggered, produce:

```markdown
## Wait-What: [Concept]

**Plain meaning:** [One sentence]

**Why it matters for MTMS:** [Business/technical impact]

**Concrete example:** [MTMS scenario with real entities]

**Boundary:** [What this excludes]

**GLOSSARY ref:** [Link or "MISSING — add to GLOSSARY"]

**Stakeholder re-pitch:** [Their words — capture after verification]
```

Save to `.scratch/wait-what-<concept>-<date>.md` for future reference.