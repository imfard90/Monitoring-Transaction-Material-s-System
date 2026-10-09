# Dockerfile Security Patterns

## Critical Issues

| Pattern | Risk | Severity | Fix |
|---------|------|----------|-----|
| No `USER` directive (runs as root) | Container root = host escalation path | HIGH | Add `USER nonroot:nonroot` after install |
| `FROM image:latest` | Unpinned, supply chain risk | MEDIUM | Pin: `FROM image@sha256:abc123...` |
| `COPY .env .` or `ADD credentials/` | Secrets baked into layers (retrievable) | CRITICAL | Use BuildKit `--mount=type=secret` |
| `ARG PASSWORD=secret` | Visible in `docker history` output | HIGH | Use runtime env or secrets mount |
| `RUN apt-get install` without `--no-install-recommends` | Bloated attack surface | LOW | Add flag + `rm -rf /var/lib/apt/lists/*` |
| `EXPOSE 22` | SSH in container = anti-pattern | MEDIUM | Remove, use `docker exec` |
| `ADD http://url/file` | Unverified remote content | HIGH | `curl` + checksum verification |
| Missing `HEALTHCHECK` | No health visibility | LOW | Add HEALTHCHECK instruction |
| `RUN chmod 777 /app` | World-writable filesystem | MEDIUM | Use 644 (files) / 755 (dirs) |
| `COPY . .` without `.dockerignore` | May include .git, .env, secrets | HIGH | Create `.dockerignore` |

## Dangerous Patterns with Examples

### Secrets in Build
```dockerfile
# CRITICAL: Secret visible in layer history
ARG DB_PASSWORD
RUN echo "password=$DB_PASSWORD" > /app/config

# SAFE: BuildKit secret mount (not stored in layer)
RUN --mount=type=secret,id=db_pass cat /run/secrets/db_pass > /app/config
```

### Running as Root
```dockerfile
# DANGEROUS: No USER = root
FROM node:20
COPY . /app
CMD ["node", "server.js"]

# SAFE: Non-root user
FROM node:20
RUN groupadd -r app && useradd -r -g app app
COPY --chown=app:app . /app
USER app
CMD ["node", "server.js"]
```

### Unpinned Dependencies
```dockerfile
# DANGEROUS: Version drift, potential supply chain attack
FROM node:latest
RUN npm install

# SAFE: Pinned base + lock file
FROM node:20.11.0-alpine@sha256:abc123
COPY package.json package-lock.json ./
RUN npm ci --only=production
```

### Multi-stage Leak
```dockerfile
# DANGEROUS: Build stage secrets leak if not discarded
FROM node:20 AS build
COPY .npmrc .  # Contains auth token!
RUN npm ci

FROM node:20-alpine
COPY --from=build /app/node_modules ./node_modules
# .npmrc is NOT in final image, but IS in build cache
```

## Docker Compose Security

| Pattern | Risk | Fix |
|---------|------|-----|
| `privileged: true` | Full host access | Remove, use capabilities |
| `volumes: /var/run/docker.sock:/var/run/docker.sock` | Docker escape | Remove unless required |
| `ports: "3306:3306"` (binds 0.0.0.0) | DB exposed to network | Use `127.0.0.1:3306:3306` |
| Missing `mem_limit` / `cpus` | Resource exhaustion | Set limits |
| `network_mode: host` | No network isolation | Use bridge/custom network |
| `env_file: .env` committed to git | Secrets in VCS | Add .env to .gitignore |

## .dockerignore Required Entries
```
.git
.env
.env.*
*.pem
*.key
id_rsa*
credentials/
secrets/
node_modules
.npm
__pycache__
*.pyc
```

## Best Practices Checklist

- [ ] Multi-stage build (separate build/runtime)
- [ ] Base image pinned to digest
- [ ] Runs as non-root user
- [ ] .dockerignore excludes secrets and dev files
- [ ] No secrets in ARG, ENV, or COPY
- [ ] Minimal packages installed
- [ ] HEALTHCHECK defined
- [ ] No unnecessary EXPOSE
- [ ] Scanned with Trivy/Snyk before push
