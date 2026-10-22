---
name: research
description: Investigate a question using high-trust primary sources and capture findings in a cited Markdown file in the repo. Use when user asks "how does X work?", "what are the tradeoffs of Y?", "compare A vs B", or needs API/first-party documentation. Not for write-ups, opinions, or speculative analysis.
---

# Research Skill

**Goal:** Produce a cited findings document the user (or future agents) can trust and act on. No hallucination, no SEO blog spam, no opinion pieces.

## When to Use

- "How does [library] handle [scenario]?"
- "What are the tradeoffs between [A] and [B]?"
- "Compare [tool] vs [tool] for [use case]"
- "Find the official API for [feature]"
- "Verify if [claim] is true"
- "What's the current best practice for [X] in [version]?"

**Don't use for:**
- Writing documentation (use `writing-for-agents`)
- Making decisions (use `grill-me` or `to-questionnaire`)
- Exploring codebase (use `codebase-design` or `domain-modeling`)

---

## Source Hierarchy (Trust Order)

| Tier | Sources | Weight |
|------|---------|--------|
| **1. Primary** | Official docs, RFCs, source code, release notes, spec repos, vendor blogs | Highest |
| **2. First-party** | Framework maintainer blogs, core team RFCs, official examples | High |
| **3. Curated secondary** | Well-known expert blogs (Kent C. Dodds, Dan Abramov, etc.), established community guides | Medium |
| **4. General** | Stack Overflow, random blogs, Reddit, Medium | Low — only as last resort, flag clearly |

**Never cite:** SEO farms, content mills, AI-generated summaries, unverified claims.

---

## Research Process

### 1. Clarify the Question

Write the exact question in one sentence. If ambiguous, ask user to narrow.

```
Research Question: [one sentence]
Scope: [what's in/out]
Success Criteria: [what would answer the question]
```

### 2. Search Primary Sources First

**Tools:** Context7 (library docs), GitHub source, official docs, RFCs.

```bash
# Example: Context7 for library docs
context7__resolve-library-id { libraryName: "next.js", query: "server actions" }
context7__query-docs { libraryId: "/vercel/next.js", query: "server actions mutation" }
```

**Search patterns:**
- `site:github.com/vercel/next.js "server actions" "mutation"`
- `site:developer.mozilla.org "fetch" "credentials"`
- `site:rfc-editor.org "9457" "problem details"`

### 3. Extract & Cite

For each finding, capture:
- **Claim** (what you found)
- **Source** (URL + section/line)
- **Date** (when published/updated)
- **Version** (if version-specific)
- **Confidence** (Primary/First-party/Curated/General)

```markdown
## Finding: [Claim]

**Source:** [URL] (section/line)
**Date:** [YYYY-MM-DD]
**Version:** [if applicable]
**Tier:** [Primary/First-party/Curated/General]

> [Direct quote or precise paraphrase]
```

### 4. Synthesize

Group findings by theme. Note conflicts between sources. Explicitly state what's **not** covered.

```markdown
## Synthesis

### Theme 1: [Name]
- Finding A supports X
- Finding B contradicts (different version/context)
- Gap: No primary source covers [edge case]

### Theme 2: [Name]
...

### Unresolved / Gaps
- [What primary sources don't answer]
```

---

## Output Format

Save to `research/<topic-slug>-<YYYYMMDD>.md` in repo root (or `.scratch/` if exists).

```markdown
# Research: [Topic]

**Question:** [Exact question]
**Date:** [YYYY-MM-DD]
**Researcher:** [Agent identifier]

---

## Executive Summary

[2-3 sentences answering the question directly]

---

## Findings

### [Theme 1]

#### Finding 1: [Claim]
**Source:** [URL] (section)
**Date:** [YYYY-MM-DD]
**Tier:** [Primary/First-party/Curated/General]

> [Quote]

#### Finding 2: [Claim]
...

### [Theme 2]
...

---

## Synthesis

[Grouped analysis, conflicts noted, gaps identified]

---

## Actionable Takeaways

- [Specific, actionable recommendations tied to findings]
- [What to do / avoid based on evidence]

---

## Sources Index

| # | Source | Tier | Date | Relevance |
|---|--------|------|------|-----------|
| 1 | [URL] | Primary | YYYY-MM-DD | High |
| 2 | [URL] | First-party | YYYY-MM-DD | Medium |
...
```

---

## Quality Gates

**Before marking research complete:**

- [ ] Every claim has a cited source (URL + location)
- [ ] Sources are Primary/First-party where possible
- [ ] General/low-tier sources flagged and minimized
- [ ] Conflicts between sources explicitly noted
- [ ] Gaps/unresolved questions listed
- [ ] No opinions, predictions, or uncited claims
- [ ] Executive summary answers the exact question
- [ ] File saved in repo (not temp directory)

---

## Red Flags — STOP

- Citing without verifying source accessibility
- Using secondary source when primary exists
- Presenting opinion as fact
- "Everyone knows X" without citation
- Skipping synthesis — raw dump of links
- Research file not saved in repo
- Using research to justify pre-made decision

---

## Example: Research "TanStack Query vs SWR for MTMS"

**Question:** "Which is better for MTMS: TanStack Query or SWR, considering server-state needs, bundle size, and React 19 compatibility?"

**Findings structure:**
- TanStack Query: Primary source (docs), bundle size (bundlephobia), React 19 support (release notes)
- SWR: Primary source (vercel/swr repo), bundle size, React 19 support
- Tradeoffs table with citations
- MTMS-specific context (existing TanStack Query usage, server actions pattern)
- Recommendation with evidence

---

## Integration with MTMS

- Research outputs live in `research/` or `.scratch/` — tracked in git
- Reference in ADRs (`docs/adr/`) when making architectural decisions
- Cite in PR descriptions when defending technical choices
- Use `context7__resolve-library-id` + `context7__query-docs` for library docs (installed in MTMS)