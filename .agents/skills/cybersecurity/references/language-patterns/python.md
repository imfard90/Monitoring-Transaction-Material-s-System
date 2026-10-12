# Python Security Patterns

## Dangerous Functions (NEVER use with untrusted input)

| Function | Risk | CWE | Severity | Safe Alternative |
|----------|------|-----|----------|-----------------|
| `eval()` | Arbitrary code execution | CWE-94 | Critical | `ast.literal_eval()` |
| `exec()` | Arbitrary code execution | CWE-94 | Critical | Restricted sandbox or avoid entirely |
| `pickle.loads()` / `pickle.load()` | Deserialization RCE (Bandit B301) | CWE-502 | Critical | `json.loads()`, `msgpack`, or sign pickles with HMAC |
| `subprocess.call(shell=True)` | Command injection | CWE-78 | Critical | `subprocess.call([...], shell=False)` with list args |
| `os.system()` | Command injection | CWE-78 | Critical | `subprocess.run([...], shell=False)` |
| `yaml.load(data)` | Arbitrary code execution | CWE-502 | Critical | `yaml.safe_load(data)` |
| `marshal.loads()` | Code execution via bytecode | CWE-502 | Critical | `json.loads()` |
| `shelve.open()` | Pickle-based deserialization | CWE-502 | High | JSON file storage |
| `__import__(user_input)` | Arbitrary module loading | CWE-94 | Critical | Allowlist of module names |
| `compile()` + `exec()` | Arbitrary code execution | CWE-94 | Critical | Avoid with untrusted input |
| `input()` (Python 2) | Calls `eval()` internally | CWE-94 | Critical | `raw_input()` in Python 2, or migrate to Python 3 |
| `tempfile.mktemp()` | Race condition (TOCTOU) | CWE-377 | Medium | `tempfile.mkstemp()` or `tempfile.NamedTemporaryFile()` |
| `os.path.join(base, user_input)` | Path traversal if input starts with `/` | CWE-22 | High | Validate input, use `PurePath().is_relative_to()` |

## Framework-Specific Vulnerabilities

### Django

| Pattern | Risk | Severity | Fix |
|---------|------|----------|-----|
| `mark_safe(user_input)` | XSS — marks string as safe HTML | Critical | Never use with untrusted input; use template auto-escaping |
| `Model.objects.raw(query)` | SQL injection | Critical | Use parameterized queries: `raw(query, [params])` |
| `.extra(where=[user_input])` | SQL injection | Critical | Use `.filter()` with Q objects instead |
| `DEBUG = True` in production | Information disclosure | High | Set `DEBUG = False` and configure `ALLOWED_HOSTS` |
| `ALLOWED_HOSTS = ['*']` | Host header injection | Medium | List specific hostnames |
| `SECRET_KEY` hardcoded | Session forgery, CSRF bypass | Critical | Load from environment variable |
| `csrf_exempt` decorator | CSRF bypass | High | Remove or use only for genuine API endpoints with token auth |
| `JsonResponse` with user objects | Sensitive data exposure | Medium | Serialize explicitly, exclude sensitive fields |

```python
# VULNERABLE: Django raw SQL
def search(request):
    query = request.GET.get('q')
    results = User.objects.raw(f"SELECT * FROM users WHERE name = '{query}'")  # SQL injection

# SECURE: Parameterized query
def search(request):
    query = request.GET.get('q')
    results = User.objects.raw("SELECT * FROM users WHERE name = %s", [query])

# VULNERABLE: mark_safe with user input
from django.utils.safestring import mark_safe
def render_bio(request):
    bio = request.POST.get('bio')
    return HttpResponse(mark_safe(bio))  # XSS

# SECURE: Let Django auto-escape in templates
# In template: {{ bio }}  — auto-escaped by default
```

### Flask

| Pattern | Risk | Severity | Fix |
|---------|------|----------|-----|
| `app.run(debug=True)` in production | Debugger RCE (Werkzeug PIN bypass) | Critical | Never enable debug in production |
| `send_file(user_path)` | Path traversal, arbitrary file read | Critical | Use `send_from_directory()` with safe base path |
| `render_template_string(user_input)` | Server-side template injection (SSTI) | Critical | Use `render_template()` with file-based templates |
| No `SECRET_KEY` or weak key | Session forgery | Critical | Generate strong random key |

```python
# VULNERABLE: Flask SSTI
@app.route('/hello')
def hello():
    name = request.args.get('name', 'World')
    return render_template_string(f'Hello {name}!')  # SSTI: name={{config}}

# SECURE: Use template parameters
@app.route('/hello')
def hello():
    name = request.args.get('name', 'World')
    return render_template_string('Hello {{ name }}!', name=name)

# VULNERABLE: Path traversal via send_file
@app.route('/download')
def download():
    filename = request.args.get('file')
    return send_file(f'/uploads/{filename}')  # Traversal: file=../../etc/passwd

# SECURE: Use send_from_directory
@app.route('/download')
def download():
    filename = request.args.get('file')
    return send_from_directory('/uploads', filename)
```

### FastAPI

| Pattern | Risk | Severity | Fix |
|---------|------|----------|-----|
| Raw SQL strings with f-strings | SQL injection | Critical | Use ORM or parameterized queries |
| Missing `Depends()` auth on routes | Unauthorized access | High | Add dependency injection for auth |
| `response_model` omitted | Data leakage (extra fields) | Medium | Always define `response_model` |

```python
# VULNERABLE: FastAPI with raw SQL
@app.get("/users/{user_id}")
async def get_user(user_id: str):
    query = f"SELECT * FROM users WHERE id = '{user_id}'"  # SQL injection
    result = await database.fetch_one(query)
    return result

# SECURE: Parameterized query
@app.get("/users/{user_id}")
async def get_user(user_id: int):  # Type validation via path parameter
    query = "SELECT * FROM users WHERE id = :id"
    result = await database.fetch_one(query, values={"id": user_id})
    return result
```

## Common Anti-Patterns

### Deserialization

```python
# VULNERABLE: Pickle from untrusted source
import pickle
data = pickle.loads(request.body)  # RCE via crafted pickle

# SECURE: Use JSON
import json
data = json.loads(request.body)

# VULNERABLE: YAML unsafe load
import yaml
config = yaml.load(user_uploaded_file)  # Arbitrary code execution

# SECURE: YAML safe load
config = yaml.safe_load(user_uploaded_file)
```

### Command Injection

```python
# VULNERABLE: Shell injection
import subprocess
filename = request.args.get('file')
subprocess.call(f'cat {filename}', shell=True)  # file=; rm -rf /

# SECURE: List arguments, no shell
subprocess.call(['cat', filename], shell=False)

# VULNERABLE: os.system
os.system(f'convert {input_file} {output_file}')

# SECURE: subprocess with list
subprocess.run(['convert', input_file, output_file], check=True)
```

### Path Traversal

```python
# VULNERABLE: Path traversal
import os
base = '/var/uploads'
filename = request.args.get('file')
path = os.path.join(base, filename)  # filename = "../../etc/passwd" works!
with open(path) as f:
    return f.read()

# SECURE: Resolve and validate
from pathlib import Path
base = Path('/var/uploads').resolve()
requested = (base / filename).resolve()
if not requested.is_relative_to(base):  # Python 3.9+
    raise ValueError("Path traversal detected")
with open(requested) as f:
    return f.read()
```

### Insecure Randomness

```python
# VULNERABLE: Predictable tokens
import random
token = ''.join(random.choices('abcdef0123456789', k=32))

# SECURE: Cryptographic randomness
import secrets
token = secrets.token_hex(32)
```

## Dependency Risks

| Package | Risk | Details |
|---------|------|---------|
| `requests` without `verify=True` | MITM attacks | `requests.get(url, verify=False)` disables TLS verification |
| `paramiko` < 3.4 | Various CVEs | Keep updated; avoid password auth without rate limiting |
| `pyyaml` with `yaml.load()` | RCE via YAML deserialization | Always use `yaml.safe_load()` |
| `Jinja2` with `autoescape=False` | XSS in templates | Set `autoescape=True` (default in Flask, not standalone) |
| `cryptography` < 41.0 | Known vulnerabilities | Keep updated |
| `pillow` (older versions) | Image parsing buffer overflows | Keep updated; validate image dimensions |
| `lxml` with `resolve_entities=True` | XXE attacks | Use `defusedxml` or disable entity resolution |
| `setuptools` / `pip` | Typosquatting risk | Verify package names before installing |

### Scanning Tools

```bash
# Check for known vulnerabilities in dependencies
pip-audit
safety check

# Static analysis for security issues
bandit -r ./project/
semgrep --config=p/python
```
