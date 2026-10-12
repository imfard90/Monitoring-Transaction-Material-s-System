# Kubernetes Security Patterns

## Critical Misconfigurations

| Pattern | Risk | Severity | Fix |
|---------|------|----------|-----|
| `privileged: true` | Full host access, container escape | CRITICAL | Remove, use specific capabilities |
| `hostNetwork: true` | Access host network stack | HIGH | Remove unless system pod |
| `hostPID: true` / `hostIPC: true` | Namespace escape | HIGH | Remove |
| Missing `resources.limits` | Resource exhaustion, DoS | MEDIUM | Set CPU/memory limits |
| `runAsUser: 0` | Root in container | HIGH | Use non-root UID (65534) |
| Secrets in plain YAML | Credentials in git | CRITICAL | Use SealedSecrets/ExternalSecrets/Vault |
| Missing NetworkPolicy | All-to-all pod communication | HIGH | Implement default-deny |
| `automountServiceAccountToken: true` | Unnecessary K8s API access | MEDIUM | Set false unless pod needs API |
| Default service account used | Over-permissioned | MEDIUM | Create dedicated ServiceAccount |
| Missing `readOnlyRootFilesystem: true` | Writable container FS | MEDIUM | Enable + emptyDir for temp |
| `allowPrivilegeEscalation: true` | Privilege escape path | HIGH | Set false |
| Image tag `:latest` | Unpinned, unpredictable | MEDIUM | Use specific version or digest |

## SecurityContext Patterns

### Dangerous (missing hardening)
```yaml
# No securityContext = all defaults (dangerous)
spec:
  containers:
    - name: app
      image: myapp:latest
```

### Secure (hardened)
```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    fsGroup: 65534
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      image: myapp@sha256:abc123
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      resources:
        limits:
          memory: "256Mi"
          cpu: "500m"
        requests:
          memory: "128Mi"
          cpu: "250m"
```

## Secrets Management

### CRITICAL: Secrets in Plain YAML
```yaml
# NEVER do this — secrets are only base64 encoded, NOT encrypted
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
data:
  password: cGFzc3dvcmQxMjM=  # "password123" in base64 — NOT secure!
```

### Safe Alternatives
- **SealedSecrets**: Encrypt at client, decrypt only in cluster
- **External Secrets Operator**: Sync from Vault/AWS SM/GCP SM
- **HashiCorp Vault**: Dynamic secrets with TTL
- **SOPS**: Encrypt YAML values with KMS

## NetworkPolicy

### Default-Deny (Baseline)
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: {}  # All pods
  policyTypes:
    - Ingress
    - Egress
```

### Missing NetworkPolicy = All pods can talk to all pods
This means a compromised pod can reach any service, database, or internal API.

## RBAC Security Patterns

| Pattern | Risk | Fix |
|---------|------|-----|
| ClusterRoleBinding to `cluster-admin` for app | Full cluster access | Create minimal ClusterRole |
| `verbs: ["*"]` in Role | All operations allowed | Specify exact verbs needed |
| `resources: ["*"]` in Role | All resource types | Specify exact resources |
| `create pods/exec` permission | Escape to any namespace | Restrict to specific namespaces |
| ServiceAccount with cluster-wide access | Lateral movement | Namespace-scoped roles only |

## Pod Security Standards (PSS)

| Level | Use For | Key Restrictions |
|-------|---------|-----------------|
| **Privileged** | System pods only (kube-system) | No restrictions |
| **Baseline** | General workloads | No privileged, no hostNetwork/PID/IPC, no dangerous capabilities |
| **Restricted** | Security-sensitive workloads | Must run as non-root, drop ALL capabilities, read-only root FS, seccomp enforced |

## Container Escape CVEs (Recent)

| CVE | Impact | Detection |
|-----|--------|-----------|
| CVE-2025-23266 (NVIDIAScape) | Container escape via GPU driver | Check for nvidia runtime + privileged |
| runC CVEs (Nov 2025) | Race condition in masked path handling | Check runC version in node info |
| CVE-2024-21626 (Leaky Vessels) | Container escape via /proc/self/fd | Check runC version |

## Detection Checklist

- [ ] No privileged containers
- [ ] All pods run as non-root
- [ ] Resource limits set on all containers
- [ ] NetworkPolicies enforce segmentation
- [ ] Secrets not stored in plain YAML
- [ ] ServiceAccounts are workload-specific
- [ ] Images pinned to digest
- [ ] ReadOnlyRootFilesystem enabled
- [ ] Capabilities dropped (ALL)
- [ ] SecurityContext defined on all pods
- [ ] RBAC follows least-privilege
- [ ] No wildcard permissions in Roles
