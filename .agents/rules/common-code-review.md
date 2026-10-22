# Code Review Standards

## Purpose

Code review ensures quality, security, and maintainability before code is merged. This rule defines when and how to conduct code reviews.

## When to Review

**MANDATORY review triggers:**

- After writing or modifying code
- Before any commit to shared branches
- When security-sensitive code is changed (auth, payments, user data)
- When architectural changes are made
- Before merging pull requests

**Pre-Review Requirements:**

Before requesting review, ensure:

- All automated checks (CI/CD) are passing
- Merge conflicts are resolved
- Branch is up to date with target branch

## Review Checklist

Before marking code complete:

- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines)
- [ ] Source files are cohesive (under the 800-line soft maintainability ceiling, or include a reason for a deliberate exception)
- [ ] No deep nesting (>4 levels)
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No console.log or debug statements
- [ ] Tests exist for new functionality
- [ ] Test coverage meets 80% minimum

## Security Review Triggers

**STOP and use security-reviewer agent when:**

- Authentication or authorization code
- User input handling
- Database queries
- File system operations
- External API calls
- Cryptographic operations
- Payment or financial code

## Review Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern, including an unexplained source file over the soft 800-line ceiling | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |

## Review Capabilities & Workflows

In MTMS with Cline, code reviews are conducted using:

| Persona / Skill | Purpose | Activation in Cline |
|-----------------|---------|---------------------|
| **two-axis-code-review** | Two-axis review: Standards + Spec | Invoke `/review` workflow (step 3) |
| **code-reviewer** | Code quality, architecture, dead code | Supplementary context for Standards axis |
| **security-reviewer** | Security vulnerabilities, OWASP Top 10 | Invoke `/security` workflow |
| **typescript-reviewer** | TypeScript typing, Kysely types, Zod schemas | Run `pnpm tsc --noEmit` & Biome |

## Review Workflow

```
1. Run git diff or review modified files
2. Verify formatting and linting: `pnpm format && pnpm lint`
3. Verify type soundness: `pnpm tsc --noEmit`
4. Run unit tests: `pnpm test:unit`
5. **Invoke `two-axis-code-review` skill** for the diff scope (Standards + Spec axes in parallel)
6. Check security checklist (auth, SQL, secrets, rate limiting)
7. Check business logic compliance against `bispro.md` and `AGENTS.md`
```

> **Note**: The two-axis review replaces the single-axis checklist approach. Standards axis uses Fowler Smell Baseline + repo docs. Spec axis validates against originating issue/spec. Findings are reported side-by-side, not merged.

## Common Issues to Catch

### Security

- Hardcoded credentials (API keys, passwords, tokens)
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (unescaped user input)
- Path traversal (unsanitized file paths)
- CSRF protection missing
- Authentication bypasses

### Code Quality

- Large functions (>50 lines) - split into smaller
- Large files (>800 lines) - extract modules
- Deep nesting (>4 levels) - use early returns
- Missing error handling - handle explicitly
- Mutation patterns - prefer immutable operations
- Missing tests - add test coverage

### Performance

- N+1 queries - use JOINs or batching
- Missing pagination - add LIMIT to queries
- Unbounded queries - add constraints
- Missing caching - cache expensive operations

## Approval Criteria

- **Approve**: No CRITICAL or HIGH issues
- **Warning**: Only HIGH issues (merge with caution)
- **Block**: CRITICAL issues found

## Integration with Other Rules

This rule works with:

- [testing.md](common-testing.md) - Test coverage requirements
- [security.md](common-security.md) - Security checklist
- [git-workflow.md](common-git-workflow.md) - Commit standards
- [agents.md](common-agents.md) - Agent delegation
