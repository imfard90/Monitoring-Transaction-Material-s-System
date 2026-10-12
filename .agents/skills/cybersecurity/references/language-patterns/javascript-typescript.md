# JavaScript / TypeScript Security Patterns

## Dangerous Functions

| Function | Risk | CWE | Severity | Safe Alternative |
|----------|------|-----|----------|-----------------|
| `eval(userInput)` | Code injection | CWE-94 | CRITICAL | `JSON.parse()`, static analysis |
| `new Function(code)` | Code injection | CWE-94 | CRITICAL | Predefined functions |
| `setTimeout(string, ms)` | Code injection | CWE-94 | HIGH | `setTimeout(fn, ms)` |
| `setInterval(string, ms)` | Code injection | CWE-94 | HIGH | `setInterval(fn, ms)` |
| `child_process.exec(cmd)` | Command injection | CWE-78 | CRITICAL | `execFile()` with array args |
| `child_process.execSync(cmd)` | Command injection | CWE-78 | CRITICAL | `execFileSync()` |
| `innerHTML = userInput` | XSS | CWE-79 | HIGH | `textContent`, DOM API |
| `document.write(data)` | XSS | CWE-79 | HIGH | DOM manipulation |
| `outerHTML = userInput` | XSS | CWE-79 | HIGH | `textContent` |
| `vm.runInNewContext(code)` | Sandbox escape | CWE-94 | CRITICAL | Isolated workers, `vm2` |
| `require(userInput)` | Arbitrary module load | CWE-94 | CRITICAL | Static imports, allowlist |
| `RegExp(userInput)` | ReDoS | CWE-1333 | MEDIUM | Validate/sanitize pattern, `re2` |

## Prototype Pollution (JavaScript-Unique Critical Threat)

```javascript
// DANGEROUS: Deep merge with user input
const _ = require('lodash');
_.merge(config, req.body);
// If req.body = {"__proto__": {"isAdmin": true}}
// ALL objects now have isAdmin = true

// DANGEROUS: Recursive property assignment
function deepSet(obj, path, value) {
  const keys = path.split('.');
  // If path = "__proto__.polluted" → prototype pollution
}

// SAFE: Use Object.create(null) for dictionaries
const safeMap = Object.create(null);

// SAFE: Filter __proto__, constructor, prototype from keys
const FORBIDDEN = ['__proto__', 'constructor', 'prototype'];
```

**Impact**: Prototype pollution can escalate to RCE via `child_process.fork()` exploitation or bypass security checks globally.

## Framework-Specific Vulnerabilities

### React
| Pattern | Risk | Fix |
|---------|------|-----|
| `dangerouslySetInnerHTML={{__html: userInput}}` | XSS | Sanitize with DOMPurify |
| `href={userInput}` with `javascript:` protocol | XSS | Validate URL scheme |
| Server components leaking secrets to client | Data exposure | Check `"use client"` boundaries |
| `useEffect` with unsanitized URL fetch | SSRF | Validate URLs server-side |

### Next.js
| Pattern | Risk | Fix |
|---------|------|-----|
| `getServerSideProps` returning sensitive data | Data leak to client | Filter response |
| API routes without auth middleware | Unauthorized access | Add auth check |
| `next.config.js` headers misconfiguration | Missing security headers | Add security headers |
| `rewrites()` to internal services | SSRF | Validate destination |

### Express.js
| Pattern | Risk | Fix |
|---------|------|-----|
| No `helmet` middleware | Missing security headers | `app.use(helmet())` |
| `express.static()` serving `.env` | Secret exposure | Configure dotfiles: 'deny' |
| `res.send(userInput)` | XSS | Use template engine with escaping |
| `req.query` in SQL without parameterization | SQLi | Use parameterized queries |
| `cors({origin: '*', credentials: true})` | Auth bypass | Specify exact origins |

### Vue.js
| Pattern | Risk | Fix |
|---------|------|-----|
| `v-html="userInput"` | XSS | Use `{{ }}` interpolation (auto-escaped) |
| `v-bind:href="userInput"` | XSS via javascript: | Validate URL scheme |

### Angular
| Pattern | Risk | Fix |
|---------|------|-----|
| `bypassSecurityTrustHtml(input)` | XSS | Let DomSanitizer work |
| `bypassSecurityTrustScript(input)` | Code injection | Remove bypass |
| `[innerHTML]="userInput"` | XSS (partial sanitization) | Use interpolation |

## TypeScript-Specific Issues

| Pattern | Risk | Fix |
|---------|------|-----|
| `as AdminUser` type assertion | Bypasses type safety at compile time, no runtime check | Runtime validation (Zod, io-ts) |
| `any` type on security-critical data | Disables type checking entirely | Use strict types |
| `@ts-ignore` above security code | Hides type errors that may indicate bugs | Fix the type error |
| `JSON.parse(data) as SecureType` | No runtime validation of parsed data | Use Zod schema validation |
| Non-null assertion `user!.isAdmin` | Crashes if null, may bypass checks | Proper null checking |

## Dependency Risks

| Package | Issue | Alternative |
|---------|-------|-------------|
| `lodash` (older versions) | Prototype pollution in merge/set/defaultsDeep | Update or use `lodash.merge` with frozen proto |
| `minimist` | Prototype pollution | `yargs`, `commander` |
| `qs` (older versions) | Prototype pollution via nested objects | Update to latest |
| `express-fileupload` | Path traversal if `mv()` used with user filename | Sanitize filename |
| `jsonwebtoken` | Algorithm confusion if not specifying algorithms | Always set `algorithms: ['RS256']` |
| `axios` | SSRF if user controls URL | Validate URL, deny private ranges |

## Common Anti-Patterns

```javascript
// DANGEROUS: Template literal SQL
const user = await db.query(`SELECT * FROM users WHERE id = '${req.params.id}'`);
// SAFE:
const user = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);

// DANGEROUS: Path traversal
const file = path.join('/uploads', req.query.filename);
// SAFE:
const safeName = path.basename(req.query.filename); // Strip directory traversal
const file = path.join('/uploads', safeName);

// DANGEROUS: Open redirect
res.redirect(req.query.returnUrl);
// SAFE:
const url = new URL(req.query.returnUrl, 'https://myapp.com');
if (url.origin === 'https://myapp.com') res.redirect(url.pathname);
```
