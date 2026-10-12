# Report Template

## Finding Format

```
[VULN-XXX] Title — concise, specific, actionable
Severity: CRITICAL|HIGH|MEDIUM|LOW|INFO (score/100) | Confidence: HIGH|MEDIUM|LOW|INFO
CWE: CWE-XXX | OWASP: A0X:2025 | MITRE: TXXXX (if threat-intel)
Location: file:line → file:line (data flow path if applicable)
Compliance: PCI DSS X.X, HIPAA §X, SOC 2 CCX (if --compliance flag)

WHAT: 1-2 sentence description of the vulnerability — what is wrong.

WHY IT MATTERS: 1-2 sentence explanation of exploitability and real-world impact.
What could an attacker actually DO with this?

EVIDENCE:
[Code snippet showing the vulnerable pattern, with markers]

FIX:
[Specific code fix — show before/after or provide the corrected code]
```

## Calibration Example — Concrete Worked Finding

This is a REAL example of the expected output format with all fields populated:

```
[VULN-001] SQL Injection in User Profile Lookup — unauthenticated endpoint
Severity: CRITICAL (94/100) | Confidence: HIGH
CWE: CWE-89 (primary), CWE-862 (secondary) | OWASP: A05:2025, A01:2025
Location: app/routes/users.py:34
Compliance: PCI DSS 6.2.4, GDPR Art. 25, HIPAA §164.312(a)(1)

WHAT: User-supplied `user_id` parameter is interpolated directly into a SQL
query via f-string without parameterization. The endpoint also lacks any
authentication check, allowing anonymous access to user profile data.

WHY IT MATTERS: An attacker can extract the entire database contents (all user
PII including emails, addresses, phone numbers) via UNION-based or blind SQL
injection. No authentication is required — the endpoint is publicly accessible.
Combined with the missing auth check, this is a direct path to full data breach.

EVIDENCE:
  app/routes/users.py:34
  @app.route('/api/users/<user_id>')
  def get_user(user_id):
      query = f"SELECT * FROM users WHERE id = '{user_id}'"  # VULNERABLE
      result = db.execute(query)
      return jsonify(result.fetchone())

FIX:
  @app.route('/api/users/<user_id>')
  @login_required                                             # Add authentication
  def get_user(user_id):
      current_user = get_current_user()
      if current_user.id != int(user_id) and not current_user.is_admin:
          abort(403)                                          # Add authorization
      result = db.execute(
          "SELECT * FROM users WHERE id = %s", (user_id,)    # Parameterized query
      )
      return jsonify(result.fetchone())
```

**Score breakdown**: Base severity 95 (SQLi with data access) × Confidence 1.0
(direct input to sink, no ORM, no framework protection) × Exploitability 1.0
(public endpoint, no WAF, no rate limit) - Context adjustment -1 (not handling
financial data specifically) = 94.

---

## Attack Path Chain Format

```
[CHAIN-XXX] Title — describes the combined attack outcome
Path: VULN-A (severity) + VULN-B (severity) + VULN-C (severity) → [Final Impact]
Combined Severity: CRITICAL
Individual severities: MEDIUM + LOW + MEDIUM = CRITICAL when chained

SCENARIO: Step-by-step explanation of how an attacker chains these findings.
Step 1: Exploit VULN-A to gain [access/information]
Step 2: Use that to exploit VULN-B for [escalation]
Step 3: Leverage VULN-C to achieve [final impact]

BREAK THE CHAIN: Which single fix eliminates the entire attack path?
```

## Verification Finding Format

```
[VERIFY-XXX] Title — requires manual verification
Confidence: LOW | Reason: [why automated analysis is insufficient]
Location: file:line

OBSERVATION: What was detected.
CANNOT DETERMINE: What additional context is needed.
RECOMMENDED CHECK: What a human reviewer should verify.
```

## Executive Summary Template

```markdown
# Security Audit Report

**Project**: [name]
**Date**: [date]
**Scope**: [full|quick|diff] — [N files analyzed]
**Tech Stack**: [languages, frameworks]
**Auditor**: Claude Cybersecurity v1.0

---

## Overall Security Score: XX/100 (Grade: X)

[If grade F or auto-critical gate:
⚠️ CRITICAL SECURITY ISSUES DETECTED — Immediate action required.
Do NOT deploy this code without addressing the critical findings below.
]

### Finding Summary
| Severity | Count | Confidence HIGH | Confidence MEDIUM | Confidence LOW |
|----------|-------|----------------|-------------------|----------------|
| CRITICAL | X | X | X | X |
| HIGH | X | X | X | X |
| MEDIUM | X | X | X | X |
| LOW | X | X | X | X |
| INFO | X | X | X | X |

### Category Scores
| Category | Score | Grade | Weight | Top Finding |
|----------|-------|-------|--------|-------------|
| Vulnerability Detection | XX/100 | X | 20% | [title] |
| Authorization & Access | XX/100 | X | 15% | [title] |
| Secret Management | XX/100 | X | 10% | [title] |
| Dependency Security | XX/100 | X | 10% | [title] |
| Infrastructure Security | XX/100 | X | 10% | [title] |
| Threat Intelligence | XX/100 | X | 15% | [title] |
| AI Code Patterns | XX/100 | X | 10% | [title] |
| Logic & Design | XX/100 | X | 10% | [title] |

### Top 5 Priority Fixes
1. [VULN-XXX] [title] — [1-line action]
2. ...
```

## Methodology Footer

```markdown
---

### Methodology
- **Standards**: OWASP Top 10:2025, CWE Top 25:2024, OWASP API Security Top 10:2023
- **Threat Modeling**: STRIDE per trust boundary, MITRE ATT&CK v15 mapping
- **False Positive Reduction**: Framework-aware confidence scoring with 3-tier suppression
- **Scoring**: CVSS v4.0-aligned base severity × confidence × exploitability ± context
- **Agents**: 8 specialist reviewers with weighted aggregation

*This audit identifies issues detectable through static code analysis with AI reasoning.
It does not replace dynamic testing (DAST), penetration testing, or runtime monitoring.
Findings with Confidence < HIGH should be manually verified.*
```
