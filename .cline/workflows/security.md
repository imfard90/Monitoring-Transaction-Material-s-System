---
description: "Security audit: OWASP Top 10, mtms-security-guide, cybersecurity skill"
argument-hint: "[file-or-directory]"
---

# Security Audit Workflow

1. Load security skills:
   - `mtms-security-guide` (agentic security for MTMS)
   - `cybersecurity` (8 parallel agents, OWASP/MITRE/STRIDE)

2. Determine audit scope:
   - If argument provided: audit specified file/directory
   - Otherwise: audit recently modified files (`git diff --name-only HEAD`)

3. Run automated security scans:
   ```bash
   # Check for hardcoded secrets
   git diff HEAD | grep -iE '(password|secret|api[_-]?key|token|credential)' || true
   
   # TypeScript type safety
   pnpm tsc --noEmit
   ```

4. Apply OWASP Top 10 checklist:
   - **A01 - Broken Access Control**: Check auth middleware, role checks
   - **A02 - Cryptographic Failures**: Review encryption, hashing, TLS
   - **A03 - Injection**: SQL injection, XSS, command injection
   - **A04 - Insecure Design**: Review threat model, security patterns
   - **A05 - Security Misconfiguration**: Check env vars, CSP headers
   - **A06 - Vulnerable Components**: Check `pnpm audit`
   - **A07 - Auth Failures**: Session management, MFA, rate limiting
   - **A08 - Data Integrity**: CSRF, insecure deserialization
   - **A09 - Logging Failures**: Audit trails, sensitive data in logs
   - **A10 - SSRF**: Validate URLs, restrict outbound requests

5. MTMS-specific security checks:
   - Better Auth configuration: trustedOrigins, session security
   - Database queries: Kysely usage (no raw SQL), parameter binding
   - Server Actions: Zod validation on all inputs
   - Redis cache: No sensitive data cached without encryption
   - Environment variables: No secrets in git, all use `.env`

6. Report findings:
   ```
   ## Security Audit Summary
   Scope: [files/directories]
   
   ## CRITICAL Vulnerabilities
   [list any found]
   
   ## HIGH Risk Issues
   [list any found]
   
   ## MEDIUM Risk Issues
   [list any found]
   
   ## Recommendations
   [security hardening suggestions]
   ```

7. If pre-deployment: verify checklist in `mtms-security-guide`
