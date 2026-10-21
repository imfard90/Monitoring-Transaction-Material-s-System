---
description: "Security audit: OWASP Top 10, mtms-security-guide, cybersecurity skill"
argument-hint: "[file-or-directory]"
---

# Security Audit Workflow

1. Load security skills:
   - `mtms-security-guide` — read `.agents/skills/mtms-security-guide/security-guide.md`; apply its agentic threat model, prompt-injection controls, and secret-exposure guidance alongside the MTMS controls below.
   - `cybersecurity` — use its available OWASP/MITRE/STRIDE guidance; do not assume a fixed agent count or parallel-agent capability.
2. Read `AGENTS.md` and `docs/AUDIT_REPORT.md` before auditing. For NTE-specific review, read `docs/NTE_SECURITY_WORKFLOW.md` and `docs/adr/002_nte_stored_procedures_and_warehouse_mapping.md`; these are review guidance, not authorization to implement or run migrations.
3. Inspect only requested scope and relevant contracts; protect unrelated user changes and do not reveal secrets or sensitive data in findings.
4. Determine audit scope:
   - If argument provided: audit specified file/directory
   - Otherwise: audit recently modified files (`git diff --name-only HEAD`)
5. Run automated security scans:
   ```bash
   # Check for hardcoded secrets
   git diff HEAD | grep -iE '(password|secret|api[_-]?key|token|credential)' || true

   # TypeScript type safety
   pnpm tsc --noEmit
   ```
6. Apply OWASP Top 10 checklist:
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
   - Database queries: Kysely usage (parameter binding), stored procedures for inventory mutations
   - Server Actions: Zod validation on all inputs, `getSessionUser()` / `getSessionNik()` check at start (no fail-open)
   - External REST APIs (`/api/v1/*`):
     - `authenticateApiRequest()` called first
     - SHA-256 hashed API keys (`hashApiKey()`)
     - Admin approval gate (`appr_api === true`)
     - Atomic per-user Redis rate limiting (300s window)
     - RFC 9457 Problem Details error responses
   - Redis cache: No sensitive data cached without encryption
   - Environment variables: No secrets in git, all use `.env` / `.env.example` template

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
