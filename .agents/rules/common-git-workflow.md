# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: ECC-managed installs set `"includeCoAuthoredBy": false` in `~/.claude/settings.json`, so commits carry no `Co-Authored-By` trailer by default. To keep Claude attribution, set `"includeCoAuthoredBy": true` or configure `attribution`; ECC never overwrites an explicit choice.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

## GitHub MCP Integration

When working with GitHub repositories, prefer using the **GitHub MCP Server** (`github__*`) instead of running ad-hoc curl scripts or manual scraping:

- **Inspecting PRs**: Use `github__get_pull_request` and `github__get_pull_request_files` to retrieve remote PR diffs, status checks, and discussion context.
- **Reviewing PRs**: Use `github__create_pull_request_review` or `github__add_issue_comment` to post structured review feedback.
- **Commit & Issue History**: Use `github__list_commits` and `github__search_issues` to trace historical changes or linked tickets.
- **Code Search**: Use `github__search_code` to locate symbols or patterns across branches without local checkout.

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](common-development-workflow.md).
