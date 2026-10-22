---
name: two-axis-code-review
description: Review changes since fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow repo's documented coding standards?) and Spec (does code match originating issue/spec asked for?). Runs both reviews in parallel and reports side by side. Use when user wants review branch, PR, work-in-progress changes, or asks "review since X".
---

# Two-Axis Code Review

Review the diff between a fixed point and HEAD along two independent axes. The axes are deliberately separate — a change can pass one and fail the other.

## Fixed Point Resolution

```bash
# Resolve fixed point
git rev-parse <fixed-point>  # e.g., main, HEAD~5, abc123, merge-base main feature-branch

# Get diff (three-dot = merge-base)
git diff <fixed-point>...HEAD

# Commit list for context
git log <fixed-point>..HEAD --oneline
```

If the fixed point does not resolve or the diff is empty, abort and ask the user to clarify.

---

## Axis 1: Standards

**Sources (in order):**
1. `CODING_STANDARDS.md` or `CONTRIBUTING.md` (if exists — must be on list)
2. `.agents/rules/*.md` and `.cline/rules/*.md` (project rules)
3. `biome.json` / `tsconfig.json` (tooling-enforced standards)
4. **Fowler Smell Baseline** (always applies, even if repo documents nothing)

### Fowler Smell Baseline (Refactoring, Ch. 3)

| Smell | Detection | Fix Direction |
|-------|-----------|---------------|
| **Mysterious Name** | Function/variable/type name doesn't reveal purpose | Rename; if no honest name comes, design is murky |
| **Duplicated Code** | Same logic shape in >1 hunk/file in change | Extract shared shape, call from both |
| **Feature Envy** | Method reaches into another object's data more than its own | Move method onto data it envies |
| **Data Clumps** | Same few fields/params keep appearing together | Extract into object or parameter object |
| **Shotgun Surgery** | One logical change forces scattered edits across many files | Gather changes into one module |
| **Divergent Change** | One file/module edited for several unrelated reasons | Split so each module changes for one reason |
| **Speculative Generality** | Abstraction/parameters/hooks added for needs spec doesn't have | Delete it; inline back until real need shows |
| **Message Chains** | Long `a.b().c().d()` navigation caller shouldn't depend on | Hide walk behind one method on first object |
| **Middle Man** | Class/function mostly just delegates onward | Cut it, call real target direct |
| **Refused Bequest** | Subclass/implementer ignores or overrides most of what it inherits | Drop inheritance, use composition |

**Two Rules Bind the Baseline:**
1. **Repo overrides** — a documented repo standard always wins; if the repo endorses something the baseline flags, suppress the smell.
2. **Always a judgement call** — each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Skip anything tooling already enforces.

---

## Axis 2: Spec

**Spec Source Identification (in order):**
1. Issue references in commit messages (`#123`, `Closes #45`, GitLab `!67`), fetched via workflow
2. Path user passed as argument
3. Spec file under `docs/`, `specs/`, or `.scratch/` matching branch name or feature
4. If nothing is found, ask the user where the spec is. If they say there is none, **the Spec axis skips** and reports "no spec available".

---

## Parallel Execution

Spawn both reviews simultaneously. Do not sequence them — the axes must not pollute each other.

### Standards Sub-Agent Prompt

```
Review the diff against the following standards sources:
[LIST STANDARDS FILES FOUND + FULL SMELL BASELINE PASTED HERE]

Report, per file/hunk where relevant:
(a) Every place the diff violates a documented standard: cite the standard (file + rule)
(b) Any baseline smell you spot: name it and quote the hunk

Distinguish hard violations from judgement calls:
- Documented-standard breaches can be hard violations
- Baseline smells are ALWAYS judgement calls
- A documented repo standard OVERRIDES the baseline

Skip anything tooling already enforces (Biome, tsc, etc.).
Under 400 words.
```

### Spec Sub-Agent Prompt

```
Review the diff against the spec at [PATH OR FETCHED CONTENTS].

Report:
(a) Requirements the spec asked for that are missing or partial
(b) Code that goes beyond the spec (scope creep)
(c) Behavioral mismatches (the spec says X, the code does Y)

Under 400 words.
```

---

## Report Format

```
## Two-Axis Code Review Summary
Fixed point: <commit-ish>
Diff: <fixed-point>...HEAD
Commits: <count>

### Standards Axis
[Findings from Standards sub-agent, verbatim or lightly cleaned]

### Spec Axis
[Findings from Spec sub-agent, verbatim or lightly cleaned]

### Summary
Standards: <N> findings (worst: <CRITICAL/HIGH/MEDIUM/LOW>)
Spec: <N> findings (worst: <CRITICAL/HIGH/MEDIUM/LOW>)
```

**Do not merge or rerank findings across axes.** The separation exists to prevent one axis from masking the other.

---

## Why Two Axes

| Scenario | Standards | Spec |
|----------|-----------|------|
| Code follows conventions but implements wrong thing | PASS | FAIL |
| Code does exactly what issue asked but breaks project conventions | FAIL | PASS |

Reporting separately stops one axis masking the other.

---

## Integration with MTMS Workflows

This skill **replaces** the single-axis review in `.cline/workflows/review.md` step 5.

**Updated workflow step 5:**
> 5. Invoke `two-axis-code-review` skill for the diff scope. Run both axes in parallel. Report findings side by side using the format above.

**Severity mapping to MTMS:**
- Standards hard violation → CRITICAL/HIGH
- Baseline smell → MEDIUM (judgement call)
- Spec missing requirement → CRITICAL/HIGH
- Spec scope creep → MEDIUM/LOW

---

## Verification Checklist

Before marking review complete:

- [ ] Fixed point resolved and diff non-empty
- [ ] Standards sources identified (repo docs + smell baseline)
- [ ] Spec source identified (or confirmed unavailable)
- [ ] Both axes executed in parallel (not sequential)
- [ ] Findings reported side-by-side, not merged
- [ ] Judgement calls clearly labelled (baseline smells)
- [ ] Tooling-enforced items skipped
- [ ] Summary includes worst issue per axis

---

## Red Flags — STOP

- Running axes sequentially (pollution risk)
- Merging findings into single ranked list
- Treating baseline smells as hard violations
- Skipping spec axis because "no obvious spec"
- Using this skill without a fixed point (use `main` or `HEAD~5` as default)
- Reviewing uncommitted working tree changes without a base commit