# Skill Library Router

## Purpose

Route requests to LIBRARY-tier skills — skills not loaded by default but available on demand for MTMS. Prevents context bloat by keeping heavy/specialized skills out of every session.

## DAILY vs LIBRARY Classification

### DAILY (always active — loaded automatically)
These skills are always relevant to MTMS development:

| Skill | Reason |
|-------|--------|
| `frontend-patterns` | React/Next.js patterns used every session |
| `react-patterns` | React 18/19 hooks, RSC, Suspense |
| `react-performance` | Vercel perf rules — waterfalls, bundle, re-renders |
| `ui-styling` | shadcn/ui + Tailwind CSS 4 + CVA |
| `ui-ux-pro-max` | Design system, palettes, typography |
| `hallmark` | Anti-AI-slop page design |
| `motion-foundations` | Framer Motion tokens + springs |
| `motion-patterns` | Button, modal, toast, stagger animations |
| `backend-patterns` | Next.js API routes, Server Actions |
| `prisma-patterns` | Kysely-adjacent DB patterns (adapt to Kysely) |
| `postgres-patterns` | PostgreSQL schema, indexes, RLS |
| `database-migrations` | Migration best practices |
| `error-handling` | TypeScript error types, retries |
| `tdd-workflow` | TDD with 80%+ coverage |
| `react-testing` | RTL + Vitest + MSW |
| `e2e-testing` | Playwright Page Object Model |
| `security-review` | Auth, input, secrets, API endpoints |
| `git-workflow` | Branching, commits, conflict resolution |
| `coding-standards` | Naming, readability, immutability |
| `clean-code` | Robert C. Martin rules |
| `api-design` | REST naming, status codes, pagination |
| `mtms-create-page` | MTMS dashboard page scaffold |
| `mtms-change-branding` | MTMS rebrand workflow |
| `better-auth` | Better Auth proxy + Nginx + middleware |
| `mtms-security-guide` | MTMS agentic security guide |

### LIBRARY (load on demand)
Load these only when the specific need arises:

#### Architecture & Design
| Skill | Load When |
|-------|-----------|
| `clean-architecture` | Restructuring layers, ports/adapters |
| `hexagonal-architecture` | Domain boundary refactor |
| `domain-driven-design` | Modeling complex inventory domain |
| `domain-driven-design-distilled` | Lightweight DDD for bounded contexts |
| `patterns-of-enterprise-application-architecture` | Service layer, repository, DTO design |
| `designing-data-intensive-applications` | Replication, consistency, stream design |
| `a-philosophy-of-software-design` | Module boundary, API abstraction review |
| `refactoring` | Fowler-style safe refactor |
| `refactoring-guru` | Code smell diagnosis |
| `architecture-decision-records` | Capturing ADRs during design sessions |

#### Security (on-demand)
| Skill | Load When |
|-------|-----------|
| `cybersecurity` | Full 8-agent security audit |
| `implementing-jwt-signing-and-verification` | JWT hardening |
| `implementing-api-rate-limiting-and-throttling` | Rate limit design |
| `implementing-api-key-security-controls` | API key rotation/scoping |
| `implementing-api-abuse-detection-with-rate-limiting` | Adaptive rate limiting |
| `implementing-api-schema-validation-security` | OpenAPI schema enforcement |
| `implementing-devsecops-security-scanning` | CI/CD SAST/DAST/SCA setup |
| `implementing-hashicorp-vault-dynamic-secrets` | Vault dynamic credentials |
| `implementing-secret-scanning-with-gitleaks` | Gitleaks pre-commit setup |
| `testing-api-authentication-weaknesses` | Auth weakness testing |
| `testing-api-for-broken-object-level-authorization` | BOLA/IDOR testing |
| `testing-api-security-with-owasp-top-10` | OWASP API Top 10 |
| `testing-for-xss-vulnerabilities` | XSS testing |
| `testing-for-json-web-token-vulnerabilities` | JWT vuln testing |
| `testing-oauth2-implementation-flaws` | OAuth2 flaw testing |
| `testing-cors-misconfiguration` | CORS misconfiguration |
| `testing-prompt-injection-in-rag-pipelines` | RAG prompt injection |
| `detecting-anomalous-authentication-patterns` | UEBA auth anomaly |
| `detecting-api-enumeration-attacks` | BOLA enumeration detection |
| `detecting-indirect-prompt-injection` | Indirect prompt injection |
| `detecting-oauth-token-theft` | OAuth token theft detection |
| `detecting-sql-injection-via-waf-logs` | WAF SQLi log analysis |
| `detecting-supply-chain-attacks-in-ci-cd` | CI/CD supply chain |
| `exploiting-sql-injection-vulnerabilities` | SQLi pentest (authorized) |
| `exploiting-jwt-algorithm-confusion-attack` | JWT algo confusion |
| `exploiting-mass-assignment-in-rest-apis` | Mass assignment testing |
| `exploiting-broken-function-level-authorization` | BFLA testing |
| `exploiting-api-injection-vulnerabilities` | API injection testing |
| `performing-web-application-penetration-test` | Full web app pentest |
| `performing-csrf-attack-simulation` | CSRF simulation |
| `performing-security-headers-audit` | Security headers audit |
| `performing-sca-dependency-scanning-with-snyk` | Snyk SCA scanning |
| `performing-oauth-scope-minimization-review` | OAuth scope audit |
| `conducting-api-security-testing` | REST/GraphQL/gRPC API security |
| `configuring-oauth2-authorization-flow` | OAuth 2.1 flow setup |
| `detecting-broken-object-property-level-authorization` | BOPLA detection |
| `detecting-dependency-confusion` | Dependency confusion audit |
| `detecting-shadow-api-endpoints` | Shadow API discovery |
| `detecting-ai-model-prompt-injection-attacks` | Prompt injection detection |

#### UI & Motion (advanced)
| Skill | Load When |
|-------|-----------|
| `motion-advanced` | Drag/drop, gestures, SVG path, imperative sequences |
| `frontend-a11y` | Accessibility audit, ARIA, keyboard nav |
| `accessibility` | WCAG 2.2 AA full audit |
| `design-system` | Design system generation/audit |
| `frontend-design-direction` | Setting ECC frontend design direction |
| `make-interfaces-feel-better` | Polish: spacing, typography, shadows, motion |
| `banner-design` | Social/ad/web banner design |
| `frontend-slides` | HTML presentation from scratch or PPT |
| `slides` | Strategic HTML presentations with Chart.js |

#### DevOps & Infrastructure
| Skill | Load When |
|-------|-----------|
| `deployment-patterns` | CI/CD, Docker, health checks, rollback |
| `docker-patterns` | Dockerfile, Compose, container security |
| `redis-patterns` | Redis data structures, caching, pub/sub |
| `bun-runtime` | Bun vs Node decision, migration |
| `nextjs-turbopack` | Next.js 16+ Turbopack config |
| `vite-patterns` | Vite config, plugins, HMR, SSR |

#### Quality & Process
| Skill | Load When |
|-------|-----------|
| `code-complete` | McConnell construction rules |
| `the-pragmatic-programmer` | Engineering judgment, DRY, automation |
| `release-it` | Nygard reliability: timeouts, circuit breakers |
| `contract-first` | API/event schema contract design |
| `intent-driven-development` | Acceptance criteria before implementation |
| `tdd-workflow` | TDD enforcement (already DAILY) |
| `verification-loop` | Pre-completion verification system |
| `production-audit` | Production readiness audit |
| `agent-self-evaluation` | Self-rate output on 5 axes |
| `growth-log` | Extract reusable patterns from session |
| `council` | 4-voice council for ambiguous decisions |
| `dev-team` | Multi-role dev team simulation |

#### MCP & Agent Infrastructure
| Skill | Load When |
|-------|-----------|
| `mcp-server-patterns` | Building/debugging MCP servers |
| `ecc-guide` | ECC agents/skills/commands reference |
| `ecc-recipes` | ECC command-group workflow mapping |
| `continuous-learning-v2` | Instinct-based session learning |
| `unified-memory` | Cross-agent context sharing |
| `code-tour` | CodeTour walkthrough generation |
| `codebase-onboarding` | Onboarding guide for new devs |

## How to Use

When a task requires a LIBRARY skill, explicitly invoke it:

```
Use skill: <skill-name>
```

Or reference it in a command/workflow:

```markdown
## Step 3: Security Audit
Load skill: `cybersecurity`
Run 8-agent parallel audit...
```

## Routing Decision Tree

```
Task involves...
├── Full security audit → cybersecurity (LIBRARY)
├── Specific attack type → testing-*/exploiting-*/detecting-* (LIBRARY)
├── Architecture restructure → clean-architecture / hexagonal-architecture (LIBRARY)
├── Complex animation → motion-advanced (LIBRARY)
├── Accessibility audit → accessibility (LIBRARY)
├── CI/CD setup → deployment-patterns (LIBRARY)
├── ADR capture → architecture-decision-records (LIBRARY)
└── Everything else → DAILY skills (already active)
```

## Context Budget Note

Loading all skills simultaneously would consume ~40-60% of context window. DAILY skills cover 90% of MTMS development tasks. LIBRARY skills add depth for specialized work without polluting every session.
