# ADR 003: Agent Skills Adoption from External Repositories

## Status
Accepted

## Context
MTMS needed to upgrade its agent capabilities (skills, rules, workflows) by adopting proven patterns from three established repositories:
- **obra/superpowers** — Agentic skills framework & SDLC methodology (303k stars)
- **mattpocock/skills** — Skills for real engineers, composable & bucket-organized (300k stars)
- **multica-ai/andrej-karpathy-skills** — Goal-driven execution, anti-overcomplication (222k stars)

Pre-existing MTMS had `.agents/skills/` (12 skills) and `.agents/rules/` but lacked:
- Mandatory skill invocation discipline
- Structured skill buckets (engineering/productivity/misc/in-progress/deprecated)
- TDD-for-skills authoring methodology
- Two-axis code review (Standards + Spec parallel)
- Research skill with primary-source hierarchy
- Domain modeling discipline (GLOSSARY.md + ADRs)
- Productivity skills (grill-me, handoff, to-questionnaire, wait-what)

## Decision
Adopt and integrate the following into MTMS:

### 1. Mandatory Skill Invocation (from Superpowers)
- **Rule added to `.agents/rules/common-agents.md`**: Skills MUST be invoked before any response, including clarifying questions
- Red-flags table for 12 rationalization patterns that indicate skipped skills

### 2. Skill Bucket Structure (from mattpocock/skills)
- `.agents/skills/README.md` reorganized into 5 buckets:
  - `engineering/` — Daily code work (tdd-workflow, two-axis-code-review, research, domain-modeling, react-testing, etc.)
  - `process/` — Cross-cutting process skills (skill-authoring, two-axis-code-review)
  - `productivity/` — Non-code workflow tools (grill-me, handoff, to-questionnaire, wait-what)
  - `misc/` — Kept but rarely used
  - `in-progress/` — Beta, feedback wanted
  - `deprecated/` — No longer used

### 3. TDD-for-Skills Authoring (from Superpowers)
- `.agents/skills/process/skill-authoring/SKILL.md`: RED-GREEN-REFACTOR applied to skill creation
- Pressure-test baseline → minimal skill → verify → refactor loopholes
- Deployment checklist mandatory per skill

### 4. Two-Axis Code Review (from mattpocock/skills)
- `.agents/skills/process/two-axis-code-review/SKILL.md`:
  - Axis 1: Standards (repo docs + Fowler Smell Baseline, 10 smells)
  - Axis 2: Spec (originating issue/spec matching)
  - Parallel sub-agent execution, side-by-side reporting (no merge/rerank)
  - Severity mapping → MTMS CRITICAL/HIGH/MEDIUM/LOW
- Integrated into `.cline/workflows/review.md` step 5

### 5. Research Skill (from mattpocock/skills)
- `.agents/skills/engineering/research/SKILL.md`:
  - 4-tier source hierarchy: Primary → First-party → Curated → General
  - Structured output: `research/<topic>-<date>.md` with Executive Summary, Findings, Synthesis, Actionable Takeaways, Sources Index
  - Quality gates checklist + red flags

### 6. Domain Modeling Discipline (from mattpocock/skills)
- `.agents/skills/engineering/domain-modeling/SKILL.md`:
  - Single vs Multi-context (GLOSSARY-MAP.md)
  - Active discipline: Challenge glossary, Sharpen fuzzy terms, Concrete scenarios, Cross-ref code, Update inline, Offer ADRs sparingly
  - GLOSSARY format: Definition, Context, Synonyms, Related, Decision (ADR ref)
  - ADR format: Status, Context, Decision, Alternatives table, Consequences
  - 3 criteria for ADR: Hard reverse, Surprising without context, Real trade-off

### 7. Productivity Skills (from mattpocock/skills)
- `.agents/skills/productivity/grill-me/SKILL.md` — Relentless interview until design tree resolved
- `.agents/skills/productivity/handoff/SKILL.md` — Stateful context transfer across sessions/agents
- `.agents/skills/productivity/to-questionnaire/SKILL.md` — Ambiguous decisions → Markdown questionnaire
- `.agents/skills/productivity/wait-what/SKILL.md` — Re-pitch context in plain English using GLOSSARY

### 8. Goal-Driven Execution & Anti-Overcomplication (from Karpathy)
- Embedded in `common-agents.md` red flags: "Overcomplicate code", "Anticipate future tests", "Speculative generality"

### 9. Layer Separation Clarified
| Layer | Location | Function |
|-------|----------|----------|
| Workflows (CLI entry) | `.cline/workflows/*.md` | Run commands |
| Skills (Guidance) | `.agents/skills/*/SKILL.md` | How-to methodology |
| Rules (Standards) | `.agents/rules/common-*.md` | Severity, approval criteria |

### 10. Rule Sync
- `.cline/rules/` re-synced from canonical `.agents/rules/` to eliminate drift

## Alternatives Considered
| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Fork & maintain separate skill repo | Full control | Maintenance burden, divergence | Rejected — adopt inline, upstream via PR if needed |
| Adopt only Superpowers | Simpler | Misses mattpocock's bucket structure, two-axis review, productivity skills | Rejected — combo provides complementary strengths |
| Adopt only mattpocock/skills | Strong engineering skills | Misses Superpowers' mandatory invocation discipline & TDD-for-skills | Rejected — invocation discipline is foundational |
| Write custom skills from scratch | Tailored | Reinventing wheel, no battle-testing | Rejected — adopted skills are production-hardened |

## Consequences

### Positive
- **Disciplined agent behavior**: Mandatory invocation prevents "vibe coding" without methodology
- **Structured reviews**: Two-axis review catches spec violations AND standard violations independently
- **Reproducible research**: Primary-source hierarchy + cited findings = auditable decisions
- **Living domain model**: GLOSSARY.md + ADRs capture institutional knowledge actively
- **Cross-session continuity**: Handoff skill preserves context; grill-me resolves ambiguity early
- **Skill authoring rigor**: TDD-for-skills means new skills are pressure-tested, not speculative

### Negative / Risks
- **Learning curve**: Team must learn 8 new skills + new invocation habit
- **Verbosity**: Skills add ~2,000 lines of guidance docs
- **Maintenance**: Upstream repos evolve; MTMS must selectively sync (not auto-update)
- **False confidence**: Skills guide behavior but don't enforce — human review still required

### Mitigations
- Document each skill's "When to reach for it" clearly (already in SKILL.md description field)
- Run `/review` workflow regularly to exercise two-axis review
- Periodic audit: `git diff HEAD~10..HEAD -- .agents/skills/` to track drift
- Pre-commit hook (future): validate skill frontmatter schema

## Implementation Notes
- **Files added**: 8 new skill directories + updated README + updated common-agents.md + resynced .cline/rules/
- **Files modified**: 8 adopted skills had mangled prose fixed (only new skills, not pre-existing)
- **No code changes**: Pure documentation/methodology adoption
- **Verification**: `pnpm test:unit` passes (281 tests); lint/tsc errors are pre-existing in app code, not adoption files

## References
- Superpowers: https://github.com/obra/superpowers
- mattpocock/skills: https://github.com/mattpocock/skills
- Andrej Karpathy skills: https://github.com/multica-ai/andrej-karpathy-skills
- MTMS AGENTS.md §0 (authoritative source hierarchy)
- MTMS .agents/rules/common-agents.md (skill invocation rules)
- MTMS .cline/workflows/review.md (integrated two-axis review)