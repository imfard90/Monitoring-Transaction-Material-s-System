# Development Workflow

> This file extends [common/git-workflow.md](common-git-workflow.md) with the full feature development process that happens before git operations.

The Feature Implementation Workflow describes the development pipeline: research, planning, TDD, code review, and then committing to git.

## Feature Implementation Workflow

0. **Research & Reuse** _(scale research to the task)_
   - **Inspect the project first:** Read relevant local code, tests, package versions, and project guidance; reuse established patterns before introducing new ones.
   - **Verify external behavior when needed:** Consult Context7 or primary vendor documentation when implementation depends on library/framework/API behavior, version-specific details, or an unfamiliar integration. Context7 is an option, not a requirement for every coding task; do not look up documentation for straightforward changes already covered by local patterns and tests.
   - **Research reuse opportunities when useful:** For new dependencies, substantial new functionality, or when local patterns are insufficient, search GitHub implementations and package registries before writing a bespoke solution. Use broader web research (such as Exa) only if primary docs and targeted code search do not answer the question.
   - Prefer adopting or adapting a proven approach when it fits the requirement; avoid external research that does not reduce uncertainty or implementation risk.

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Generate planning docs before coding: PRD, architecture, system_design, tech_doc, task_list
   - Identify dependencies and risks
   - Break down into phases

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use **code-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format
   - See [git-workflow.md](common-git-workflow.md) for commit message format and PR process

5. **Pre-Review Checks**
   - Verify all automated checks (CI/CD) are passing
   - Resolve any merge conflicts
   - Ensure branch is up to date with target branch
   - Only request review after these checks pass
