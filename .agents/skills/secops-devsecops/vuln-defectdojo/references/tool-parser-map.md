# SecOpsAgentKit → DefectDojo Parser Map

Complete mapping of SecOpsAgentKit tools to DefectDojo parser names, required output formats, and the exact export command to produce compatible output.

## Table of Contents
- [Application Security (appsec)](#application-security-appsec)
- [DevSecOps (devsecops)](#devsecops)
- [Secure SDLC (secsdlc)](#secure-sdlc-secsdlc)
- [Not Natively Supported](#not-natively-supported)
- [Verifying Available Parsers](#verifying-available-parsers)

---

## Application Security (appsec)

| SecOpsAgentKit Skill | DefectDojo Parser Name | Required Format | Export Command |
|---|---|---|---|
| `sast-semgrep` | `Semgrep JSON Report` | JSON | `semgrep --config=auto . --json > semgrep.json` |
| `sast-bandit` | `Bandit Scan` | JSON | `bandit -r . -f json -o bandit.json` |
| `dast-zap` | `ZAP Scan` | XML | `zap-cli report -o zap.xml -f xml` |
| `dast-zap` (API) | `ZAP API Scan` | JSON | Use ZAP API scan report output |
| `dast-nuclei` | `Nuclei Scan` | JSON | `nuclei -target https://target -json-export nuclei.json` |
| `sca-blackduck` | `Black Duck Hub Scan` | JSON | Export via Black Duck Hub API or Detect `--detect.output.path` |

> **Note**: `dast-ffuf` and `api-mitmproxy` do not have native DefectDojo parsers. See [Not Natively Supported](#not-natively-supported).

---

## DevSecOps

| SecOpsAgentKit Skill | DefectDojo Parser Name | Required Format | Export Command |
|---|---|---|---|
| `secrets-gitleaks` | `Gitleaks Scan` | JSON | `gitleaks detect --report-format json --report-path gitleaks.json` |
| `iac-checkov` | `Checkov Scan` | JSON | `checkov -d . -o json > checkov.json` |
| `container-grype` | `Anchore Grype` | JSON | `grype <image> -o json > grype.json` |
| `container-hadolint` | `Hadolint Dockerfile check` | JSON | `hadolint -f json Dockerfile > hadolint.json` |
| `sca-trivy` | `Trivy Scan` | JSON | `trivy image --format json --output trivy.json <image>` |

---

## Secure SDLC (secsdlc)

| SecOpsAgentKit Skill | DefectDojo Parser Name | Required Format | Export Command |
|---|---|---|---|
| `sast-horusec` | `Horusec Scan` | JSON | `horusec start -p . -o json -O horusec.json` |

> **Note**: `sbom-syft` generates SBOMs (not vulnerability findings) and is not imported into DefectDojo directly. Use `container-grype` with `grype sbom:syft.json` to scan a Syft SBOM and then import the Grype output.

---

## Not Natively Supported

These tools do not have built-in DefectDojo parsers. Options are listed below.

| SecOpsAgentKit Skill | Workaround |
|---|---|
| `dast-ffuf` | Convert ffuf JSON output to a generic finding format, or import manually as a **Generic Findings Import** (CSV). |
| `api-mitmproxy` | Export captured findings as a CSV and use **Generic Findings Import**. |
| `api-spectral` | Use **Generic Findings Import** (JSON) with Spectral's `--format json` output mapped to DefectDojo's generic schema. |

### Generic Findings Import Format

For tools without a native parser, create a CSV or JSON in DefectDojo's generic format:

```csv
Date,Title,CWE,URL,Severity,Description,Mitigation,Impact,References,Active,Verified
2026-01-15,"SQL Injection in /api/users",89,"https://app.example.com/api/users",High,"Unsanitized input passed to SQL query","Use parameterized queries","Data exfiltration possible","CWE-89",true,false
```

Import using parser name: `Generic Findings Import`

---

## Verifying Available Parsers

To list all parsers available in your DefectDojo instance (useful when upgrading):

```bash
curl -s "$DD_HOST/api/v2/importers/" \
  -H "Authorization: Token $DD_API_KEY" | python3 -m json.tool | grep '"name"'
```

Parser names are **case-sensitive** and must match exactly. The list above reflects DefectDojo parsers as of recent versions — always verify against your running instance.

---

## Re-import vs Import

| Operation | Flag | When to Use |
|---|---|---|
| First scan import | *(no flag)* | Initial import of a tool's findings for an engagement |
| Subsequent scans | `--reimport` | Any scan after the first; auto-closes findings not in new results |

Always use `--reimport` for recurring pipeline scans to avoid duplicates and enable automatic closure of fixed findings.
