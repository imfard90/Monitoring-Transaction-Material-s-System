# Security Guidelines

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

## Secret Management

- NEVER hardcode secrets in source code
- ALWAYS use environment variables or secret manager
- Validate required secrets present at startup
- Rotate any secrets may been exposed

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Apply `.agents/skills/security-review/SKILL.md` or run `/security` workflow when relevant
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review entire codebase similar issues

## MTMS-Specific Security Checks

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