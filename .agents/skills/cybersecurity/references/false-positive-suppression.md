# False Positive Suppression Rules

## Purpose
The #1 complaint about security scanners is noise. Industry data: 91% false-positive rate on open-source SAST scans (Ghost Security), 865,398 average alerts per enterprise/year with only 795 (0.092%) truly critical (OX Security 2026). This file prevents our skill from making that mistake.

## Principle: Framework-Aware Confidence Adjustment

Before reporting a finding, check if the framework provides automatic protection. If it does, REDUCE confidence by one tier (HIGH→MEDIUM, MEDIUM→LOW, LOW→suppress).

## Web Framework Protections

### Django (Python)
| Pattern | Protection | Action |
|---------|-----------|--------|
| `{{ variable }}` in templates | Auto-escaped by default | Suppress XSS finding → INFO |
| `.filter()`, `.get()`, `.exclude()` | Parameterized queries | Suppress SQLi finding → INFO |
| `django.conf.settings.X` | Server-controlled values, not user input | Suppress injection finding |
| CSRF middleware enabled (default) | Anti-CSRF tokens automatic | Suppress CSRF finding → INFO |
| `@login_required` decorator | Authentication enforced | Note as protected endpoint |

**Still dangerous in Django (DO NOT suppress):**
| Pattern | Why dangerous |
|---------|---------------|
| `mark_safe(user_input)` | Explicitly bypasses auto-escaping |
| `.raw(sql)` with f-strings | Bypasses ORM parameterization |
| `.extra(where=[...])` | Raw SQL in ORM |
| `| safe` filter on user data | Bypasses template auto-escaping |
| `{% autoescape off %}` block | Disables protection for entire block |
| `DEBUG = True` in production settings | Information disclosure |

### Flask (Python)
| Pattern | Protection | Action |
|---------|-----------|--------|
| Jinja2 `{{ variable }}` | Auto-escaped (if autoescape=True, default in newer versions) | Reduce XSS confidence |
| WTForms CSRF | Token validation | Reduce CSRF confidence |

**Still dangerous in Flask:**
| Pattern | Why |
|---------|-----|
| `| safe` filter | Bypasses auto-escaping |
| `app.run(debug=True)` | Interactive debugger = RCE |
| `{% autoescape false %}` | Disables protection |

### FastAPI (Python)
| Pattern | Protection | Action |
|---------|-----------|--------|
| Pydantic models for request body | Type validation + coercion | Reduce injection confidence |
| Path/Query parameter type hints | Automatic type conversion | Note type safety |
| SQLAlchemy ORM queries | Parameterized by default | Suppress SQLi → INFO |

### Express.js (Node.js)
| Pattern | Protection | Action |
|---------|-----------|--------|
| helmet middleware active | Security headers set | Suppress missing headers finding |
| csurf middleware active | CSRF protection | Suppress CSRF → INFO |
| express-validator chain | Input validation | Reduce injection confidence |

**Still dangerous in Express:**
| Pattern | Why |
|---------|-----|
| `res.send(userInput)` without encoding | No auto-escaping in Express |
| `eval()`, `new Function()` | Code execution |
| `child_process.exec(cmd)` | Command injection |

### React (JavaScript/TypeScript)
| Pattern | Protection | Action |
|---------|-----------|--------|
| JSX `{variable}` | Auto-escaped by React DOM | Suppress XSS → INFO |
| `href={variable}` | Warns on javascript: URLs (React 16.9+) | Reduce confidence |

**Still dangerous in React:**
| Pattern | Why |
|---------|-----|
| `dangerouslySetInnerHTML` | Name says it all — explicitly bypasses protection |
| Server-side rendering with raw HTML | SSR can bypass client-side escaping |
| `href={userInput}` with `javascript:` | Can bypass React's href warning |

### Vue.js
| Pattern | Protection | Action |
|---------|-----------|--------|
| `{{ mustache }}` interpolation | Auto-escaped | Suppress XSS → INFO |

**Still dangerous:** `v-html="userInput"` bypasses escaping

### Angular
| Pattern | Protection | Action |
|---------|-----------|--------|
| `{{ interpolation }}` | Auto-sanitized by DomSanitizer | Suppress XSS → INFO |
| HttpClient | XSRF protection built-in (when server sets cookie) | Reduce CSRF confidence |

**Still dangerous:** `bypassSecurityTrustHtml()`, `bypassSecurityTrustScript()`, `bypassSecurityTrustUrl()`

### Spring Boot (Java)
| Pattern | Protection | Action |
|---------|-----------|--------|
| Spring Security CSRF (default on) | Anti-CSRF tokens | Suppress CSRF → INFO |
| JPA/Hibernate named queries | Parameterized | Suppress SQLi → INFO |
| `@RequestParam`, `@PathVariable` | Type conversion | Note type safety |
| Thymeleaf `th:text` | Auto-escaped | Suppress XSS → INFO |

**Still dangerous:** `th:utext` (unescaped text), native SQL with concatenation, SpEL injection

### Ruby on Rails
| Pattern | Protection | Action |
|---------|-----------|--------|
| ERB `<%= %>` | Auto-escaped (Rails 3+) | Suppress XSS → INFO |
| ActiveRecord scopes/where | Parameterized | Suppress SQLi → INFO |
| CSRF protection (default on) | Authenticity token | Suppress CSRF → INFO |
| Strong Parameters | Mass assignment protection | Suppress mass assignment → INFO |

**Still dangerous:** `raw()`, `html_safe`, `.find_by_sql` with interpolation, `render inline:` with user input

### ASP.NET Core (C#)
| Pattern | Protection | Action |
|---------|-----------|--------|
| Razor `@variable` | Auto-encoded | Suppress XSS → INFO |
| Entity Framework LINQ | Parameterized | Suppress SQLi → INFO |
| Anti-forgery token (default for forms) | CSRF protection | Suppress CSRF → INFO |

**Still dangerous:** `Html.Raw()`, `FromSqlRaw()` with interpolation

## ORM Protections (Cross-Framework)

These ORM query patterns are parameterized by default — REDUCE SQLi confidence to LOW/INFO:
- Django ORM: filter(), get(), exclude(), annotate(), aggregate()
- SQLAlchemy: query.filter(), session.query(), column operators
- ActiveRecord: where(), find_by(), pluck() (with hash conditions)
- Prisma: All client methods (findMany, create, update, etc.)
- Entity Framework: LINQ queries, DbSet methods
- Sequelize: findAll(), findOne() with where objects
- TypeORM: Repository methods, QueryBuilder with parameters

**EXCEPTION**: Any ORM method that accepts raw SQL MUST still be flagged:
- Django: .raw(), .extra()
- SQLAlchemy: text(), execute() with string
- Sequelize: literal(), query()
- TypeORM: query() with string interpolation

## Context-Based Suppression

### Test Code
- Files matching: `*_test.*`, `*_spec.*`, `test_*.*`, `*.test.*`, `*.spec.*`, `__tests__/*`, `tests/*`, `spec/*`, `test/*`
- REDUCE severity by one level for most findings
- EXCEPTIONS (keep original severity): hardcoded production credentials, real API keys, actual database connection strings

### Internal/Admin Code
- If endpoint requires admin authentication, REDUCE severity for auth-related findings
- Still flag: privilege escalation FROM admin to super-admin, missing audit logging

### Generated Code
- Files with headers indicating generation (protobuf, OpenAPI, GraphQL codegen)
- SUPPRESS code style and quality findings
- KEEP security findings but note as "generated code — fix in generator configuration"

### Configuration Files
- `.env.example`, `.env.sample` — SUPPRESS secret findings (these are templates)
- `.env`, `.env.local`, `.env.production` — KEEP secret findings at full severity
- Docker build args in multi-stage builds — check if exposed in final image

## Suppression Decision Tree

```
1. Is this in test code?
   YES → Reduce severity by 1 level (except real credentials)
   NO → Continue

2. Does the framework auto-protect against this vulnerability class?
   YES → Reduce confidence by 1 tier
   NO → Continue

3. Is the dangerous function explicitly bypassing framework protection?
   YES → INCREASE confidence by 1 tier (this is intentionally unsafe)
   NO → Continue

4. Is the code behind authentication?
   YES → Note as reduced attack surface, keep severity
   NO → Continue

5. Is there visible input validation in the call chain?
   YES → Reduce confidence by 1 tier if validation is appropriate
   NO → Report at full confidence
```
