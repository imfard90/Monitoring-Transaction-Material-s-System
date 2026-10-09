# MITRE ATT&CK Mappings — LinPEAS Privilege Escalation

Maps LinPEAS enumeration categories to MITRE ATT&CK Enterprise techniques and sub-techniques.

## Table of Contents
- [Primary Tactics](#primary-tactics)
- [Technique Mappings by LinPEAS Section](#technique-mappings-by-linpeas-section)
- [Detection Opportunities](#detection-opportunities-defensive-reference)
- [PTES Phase Mapping](#ptes-phase-mapping)

---

## Primary Tactics

| Tactic | ID | Description |
|--------|----|-------------|
| Privilege Escalation | TA0004 | Gaining higher-level permissions |
| Discovery | TA0007 | Enumerating environment and assets |
| Credential Access | TA0006 | Stealing credential material |
| Defense Evasion | TA0005 | Avoiding detection |
| Lateral Movement | TA0008 | Pivoting using discovered credentials |

---

## Technique Mappings by LinPEAS Section

### System Information (Discovery)

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| Kernel version | System Information Discovery | — | T1082 |
| OS / distro | System Information Discovery | — | T1082 |
| Hostname | System Network Configuration Discovery | — | T1016 |
| Architecture | System Information Discovery | — | T1082 |
| Running processes | Process Discovery | — | T1057 |
| Installed packages | Software Discovery | — | T1518 |

### Sudo / SUID / Capabilities (Privilege Escalation)

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| sudo -l | Abuse Elevation Control Mechanism | Sudo and Sudo Caching | T1548.003 |
| SUID binaries | Abuse Elevation Control Mechanism | Setuid and Setgid | T1548.001 |
| Linux capabilities | Abuse Elevation Control Mechanism | — | T1548 |
| LD_PRELOAD sudo | Hijack Execution Flow | LD_PRELOAD | T1574.006 |

### File System (Privilege Escalation + Discovery)

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| Writable /etc/passwd | Create or Modify System Process | — | T1543 |
| Writable systemd services | Create or Modify System Process | Systemd Service | T1543.002 |
| Writable cron scripts | Scheduled Task/Job | Cron | T1053.003 |
| World-writable directories | File and Directory Discovery | — | T1083 |

### Cron / Scheduled Tasks (Persistence + Privilege Escalation)

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| /etc/crontab | Scheduled Task/Job | Cron | T1053.003 |
| User crontabs | Scheduled Task/Job | Cron | T1053.003 |
| Wildcard injection | Command and Scripting Interpreter | Unix Shell | T1059.004 |
| PATH hijacking in cron | Hijack Execution Flow | PATH Interception | T1574.007 |

### Credential Access

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| .bash_history with passwords | Unsecured Credentials | Credentials In Files | T1552.001 |
| SSH private keys | Unsecured Credentials | Private Keys | T1552.004 |
| Config files with plaintext creds | Unsecured Credentials | Credentials In Files | T1552.001 |
| /etc/shadow readable | OS Credential Dumping | /etc/passwd and /etc/shadow | T1003.008 |
| Environment variables (secrets) | Unsecured Credentials | Environment Variables | T1552.007 |
| Cloud credential files (.aws/) | Unsecured Credentials | Credentials In Files | T1552.001 |

### Network (Discovery)

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| Open ports / listening services | Network Service Discovery | — | T1046 |
| Network interfaces / routes | System Network Configuration Discovery | — | T1016 |
| NFS exports | Network Share Discovery | — | T1135 |
| ARP cache | Remote System Discovery | — | T1018 |

### Container / Virtualization (Privilege Escalation + Defense Evasion)

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| Docker socket accessible | Escape to Host | — | T1611 |
| Privileged container | Escape to Host | — | T1611 |
| Kubernetes service account | — | — | T1552.007 |
| Container namespace (nsenter) | Escape to Host | — | T1611 |

### Kernel Exploits (Privilege Escalation)

| LinPEAS Check | Technique | Sub-technique | ID |
|---------------|-----------|---------------|-----|
| Kernel CVE suggestions | Exploitation for Privilege Escalation | — | T1068 |
| Vulnerable kernel module | Exploitation for Privilege Escalation | — | T1068 |

---

## Detection Opportunities (Defensive Reference)

| ATT&CK ID | Detection Signal |
|-----------|-----------------|
| T1548.001 | Audit SUID execution: `auditctl -a always,exit -F arch=b64 -S execve` |
| T1548.003 | Monitor sudoers changes: `/etc/sudoers` file integrity monitoring |
| T1053.003 | Monitor `/etc/cron*` and `/var/spool/cron` for unexpected writes |
| T1611 | Alert on `docker.sock` access by non-privileged processes |
| T1552.001 | SIEM rule: grep for `password=` in process command-line arguments |
| T1068 | Kernel patch management; monitor for kernel exploit binaries |

---

## PTES Phase Mapping

LinPEAS is primarily used in the **Post-Exploitation** phase of the Penetration Testing Execution Standard (PTES):

- **Intelligence Gathering** → System/network discovery checks
- **Vulnerability Analysis** → Kernel CVE enumeration, misconfiguration detection
- **Exploitation** → Vectors confirmed by LinPEAS → see `privesc_vectors.md`
- **Post-Exploitation** → Credential harvesting, lateral movement preparation
