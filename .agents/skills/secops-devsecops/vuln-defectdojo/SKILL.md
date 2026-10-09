---
name: vuln-defectdojo
description: >
  Vulnerability management and findings aggregation using DefectDojo. Centralizes
  security findings from all SecOpsAgentKit scanners (Semgrep, Bandit, ZAP, Trivy,
  Grype, Gitleaks, Nuclei, Checkov, Horusec) into a unified platform with automatic
  deduplication, SLA tracking, risk-based prioritization, and compliance reporting.
  Use when: (1) Aggregating findings from multiple scanners across products and
  pipelines, (2) Tracking remediation status and SLA compliance against policy
  thresholds, (3) Deduplicating overlapping findings across security tools,
  (4) Generating vulnerability reports for compliance audits (SOC2, PCI-DSS, GDPR),
  (5) Managing security debt and vulnerability backlog across teams and applications.
version: 0.1.0
maintainer: SirAppSec
category: devsecops
tags: [vulnerability-management, defectdojo, findings-aggregation, deduplication, sla-tracking, risk-management, compliance-reporting]
frameworks: [OWASP, CWE, NIST, SOC2, PCI-DSS, GDPR]
dependencies:
  python: ">=3.9"
  packages: [requests]
  tools: [docker]
references:
  - https://defectdojo.github.io/django-DefectDojo/
  - https://github.com/DefectDojo/django-DefectDojo
  - https://owasp.org/www-project-defectdojo/
---

# Vulnerability Management with DefectDojo

## Overview

DefectDojo aggregates findings from every SecOpsAgentKit scanner into one platform—deduplicating across tools, tracking SLA compliance, and producing compliance-ready reports. It transforms isolated scanner outputs into a managed vulnerability backlog with ownership and remediation history.

Key concepts:
- **Product**: An application or system being tracked
- **Engagement**: A time-boxed security activity (sprint, assessment, CI/CD pipeline)
- **Test**: A scanner run within an engagement
- **Finding**: A deduplicated security issue with full lifecycle (Active → Mitigated → Closed)

## Quick Start

Start DefectDojo locally:
```bash
git clone https://github.com/DefectDojo/django-DefectDojo.git
cd django-DefectDojo && docker compose up -d
# Access at http://localhost:8080 — change admin/admin password immediately
```

Import the first scan result:
```bash
pip install requests
./scripts/import_findings.py \
  --host http://localhost:8080 \
  --api-key <your-api-key> \
  --engagement-id 1 \
  --scan-type "Semgrep JSON Report" \
  semgrep-results.json
```

Retrieve your API key: **DefectDojo UI → User (top-right) → API v2 Key**.

## Core Workflow

### 1. Setup: Products and Engagements

Create a Product (once per application) and an Engagement (once per sprint or pipeline):

```bash
# Create product
curl -s -X POST "$DD_HOST/api/v2/products/" \
  -H "Authorization: Token $DD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App", "description": "Main application", "prod_type": 1}'

# Create engagement — use template for full options
curl -s -X POST "$DD_HOST/api/v2/engagements/" \
  -H "Authorization: Token $DD_API_KEY" \
  -H "Content-Type: application/json" \
  -d @assets/defectdojo-engagement-template.json
```

See [assets/defectdojo-engagement-template.json](assets/defectdojo-engagement-template.json) for a full CI/CD engagement template.

### 2. Import Scanner Findings

```bash
# Semgrep (SAST)
./scripts/import_findings.py --host $DD_HOST --api-key $DD_API_KEY \
  --engagement-id $EID --scan-type "Semgrep JSON Report" semgrep.json

# Trivy (containers/filesystem)
./scripts/import_findings.py --host $DD_HOST --api-key $DD_API_KEY \
  --engagement-id $EID --scan-type "Trivy Scan" trivy.json

# Gitleaks (secrets)
./scripts/import_findings.py --host $DD_HOST --api-key $DD_API_KEY \
  --engagement-id $EID --scan-type "Gitleaks Scan" gitleaks.json

# Re-import after fixes — auto-closes resolved findings
./scripts/import_findings.py --reimport --host $DD_HOST --api-key $DD_API_KEY \
  --engagement-id $EID --scan-type "Trivy Scan" trivy-new.json
```

For the complete mapping of every SecOpsAgentKit tool to its DefectDojo parser name and required output format, see [references/tool-parser-map.md](references/tool-parser-map.md).

### 3. CI/CD Pipeline Integration

Add an import step after each scanner in any pipeline:

```yaml
# GitHub Actions — add after each scanner step
- name: Import findings to DefectDojo
  env:
    DD_HOST: ${{ secrets.DD_HOST }}
    DD_API_KEY: ${{ secrets.DD_API_KEY }}
    DD_ENGAGEMENT_ID: ${{ secrets.DD_ENGAGEMENT_ID }}
  run: |
    pip install requests
    ./scripts/import_findings.py \
      --host "$DD_HOST" \
      --api-key "$DD_API_KEY" \
      --engagement-id "$DD_ENGAGEMENT_ID" \
      --scan-type "Semgrep JSON Report" \
      semgrep-results.json
```

### 4. Full Aggregation Workflow

Progress:
[ ] 1. Run all applicable scanners; save JSON output for each
[ ] 2. Import each result file with correct `--scan-type` (see references/tool-parser-map.md)
[ ] 3. Review deduplicated findings in DefectDojo UI: **Engagements → Tests → Findings**
[ ] 4. Triage: set severity, assign owner, and set SLA due dates
[ ] 5. Risk-accept findings with business justification (required for SOC2/PCI-DSS evidence)
[ ] 6. Re-run scanners after fixes; `--reimport` to auto-close resolved findings
[ ] 7. Export compliance report: **Reports → Generate Report**

Work through each step systematically. Check off completed items.

### 5. Triage and Prioritization

After import in the DefectDojo UI:

1. **Filter** by severity: Critical → High → Medium
2. **Verify deduplication**: DefectDojo auto-deduplicates across scans. Review grouped duplicates before accepting.
3. **Assign** findings to engineers with SLA due dates
4. **Risk Accept**: Document business justification for accepted risks
5. **Tag** findings by component or compliance requirement (e.g., `pci-req-6.3`)

## Security Considerations

- **Sensitive Data Handling**: DefectDojo stores vulnerability details that reveal application internals. Restrict access by role. Enable HTTPS and use SSO/LDAP for authentication in production.
- **Access Control**: Issue separate API keys per pipeline with minimum `importer` role. Use `security lead` role for triage operations. Rotate keys quarterly.
- **Audit Logging**: DefectDojo logs all finding status changes. Export audit logs as SOC2 CC7.1 and PCI-DSS 6.3.3 compliance evidence.
- **Compliance**: SLA tracking and risk acceptance workflows directly satisfy SOC2, PCI-DSS, and GDPR vulnerability management requirements. Tag findings with compliance controls for filtered audit exports.
- **Safe Defaults**: Enable 2FA, change default admin/admin credentials immediately, enable HTTPS via the override compose file (`docker-compose.override.https.yml`).

## Bundled Resources

### Scripts (`scripts/`)

- **import_findings.py** — Import or re-import scanner output to DefectDojo API with finding count summary

### References (`references/`)

- **tool-parser-map.md** — Complete mapping of all SecOpsAgentKit tools to DefectDojo parser names, required output formats, and export commands

### Assets (`assets/`)

- **defectdojo-engagement-template.json** — Reusable JSON template for creating CI/CD engagements via the DefectDojo API

## Common Patterns

### Pattern 1: Continuous CI/CD Engagement

Create one persistent `CI/CD` engagement per branch. Re-import on every merge to keep a live deduplicated finding list with auto-closure of fixed issues.

### Pattern 2: Sprint Security Review

Import all scanner outputs at end of sprint into a single time-boxed engagement. Review combined risk posture in one place; assign findings to the next sprint backlog.

### Pattern 3: Compliance Audit Export

Before an audit, filter findings by compliance tag (e.g., `pci-dss`), include risk acceptances and closure timestamps. Export as the vulnerability management evidence package.

## Integration Points

- **All SecOpsAgentKit scanners**: Parser names mapped in [references/tool-parser-map.md](references/tool-parser-map.md)
- **CI/CD**: GitHub Actions, GitLab CI, Jenkins, CircleCI — add import step after each scanner
- **Issue Trackers**: DefectDojo pushes findings to JIRA, GitHub Issues via built-in integrations
- **Notifications**: Slack and email alerts for new Critical/High findings via DefectDojo notification rules
- **SIEM**: Export findings as JSON for ingestion into Splunk, Elastic, or other SIEM platforms

## Troubleshooting

### Issue: `403 Forbidden` on import

**Solution**: Verify the API key has `importer` role or higher. Regenerate at **User → API v2 Key**. Confirm `--host` does not include a trailing slash.

### Issue: Duplicate findings after re-import

**Solution**: Use `--reimport` (not a second `--import`) for subsequent scans of the same tool against the same engagement. Re-import updates existing findings instead of creating new ones.

### Issue: Scan type not recognized

**Solution**: Parser names are case-sensitive. Check the exact value in [references/tool-parser-map.md](references/tool-parser-map.md). Use `curl "$DD_HOST/api/v2/importers/" -H "Authorization: Token $DD_API_KEY"` to list all available parsers.

## References

- [DefectDojo Documentation](https://defectdojo.github.io/django-DefectDojo/)
- [DefectDojo GitHub](https://github.com/DefectDojo/django-DefectDojo)
- [OWASP DefectDojo Project](https://owasp.org/www-project-defectdojo/)
- [DefectDojo API Reference](https://demo.defectdojo.org/api/v2/oa3/swagger-ui/)
