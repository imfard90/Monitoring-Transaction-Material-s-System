# Compliance Matrix — Code-Level Requirements

## Purpose

Maps security findings to compliance framework requirements. Used when `--compliance` flag is specified to generate framework-specific compliance assessments alongside the standard security audit.

---

## PCI DSS 4.0 — Payment Card Industry

### Requirement 6: Develop and Maintain Secure Systems and Software

| Req | Description | Code-Level Check | Maps to CWE |
|-----|-------------|------------------|-------------|
| 6.2.1 | Bespoke/custom software developed securely | Secure SDLC evidence, code review process | General |
| 6.2.2 | Software development personnel trained | N/A (process, not code) | N/A |
| 6.2.3 | Bespoke software reviewed prior to release | This audit satisfies this requirement | General |
| 6.2.4 | Prevent common attacks in bespoke software | SQLi, XSS, CSRF, buffer overflow, command injection, path traversal detection | CWE-89, 79, 352, 120, 78, 22 |
| 6.3.1 | Security vulnerabilities identified and addressed | Dependency scanning, CVE checking | Various |
| 6.3.2 | Inventory of bespoke software and third-party components | Dependency manifest exists and is complete | N/A |
| 6.4.1 | Public-facing web apps protected against attacks | WAF or equivalent, input validation | CWE-79, 89 |
| 6.4.2 | Public-facing web apps: automated technical solution for attacks | CSP headers, security headers present | CWE-693 |

### Requirement 8: Identify Users and Authenticate Access

| Req | Description | Code-Level Check |
|-----|-------------|------------------|
| 8.2.1 | Unique IDs for all users | No shared/hardcoded credentials in code |
| 8.3.1 | MFA for admin access | MFA implementation present for admin flows |
| 8.3.6 | Passwords: minimum 12 characters | Password policy enforcement in validation code |
| 8.6.1 | System/application accounts: interactive login managed | No hardcoded service account passwords |

### Requirement 3: Protect Stored Account Data

| Req | Description | Code-Level Check |
|-----|-------------|------------------|
| 3.4.1 | PAN rendered unreadable | Encryption/hashing of card numbers |
| 3.5.1 | PAN secured with strong cryptography | AES-256 or equivalent for card data at rest |
| 3.5.1.1 | Cryptographic architecture documented | Key management implementation review |
| 3.5.1.2 | Disk-level encryption not sole mechanism | Application-level encryption present for PAN |

### Requirement 4: Protect Cardholder Data Over Open, Public Networks

| Req | Description | Code-Level Check |
|-----|-------------|------------------|
| 4.2.1 | Strong cryptography for transmission | TLS 1.2+ enforcement, no fallback to weak protocols |
| 4.2.1.1 | Trusted certificates | Certificate validation enabled, no SSL verify bypass |
| 4.2.2 | PAN secured when sent via end-user messaging | No PAN in logs, emails, chat messages |

### Requirement 10: Log and Monitor All Access

| Req | Description | Code-Level Check |
|-----|-------------|------------------|
| 10.2.1 | Audit logs enabled and active | Logging framework configured and active |
| 10.2.1.1 | Audit logs capture all individual user access to cardholder data | Data access events logged with user identity |
| 10.2.1.2 | Audit logs capture all actions by admin | Admin action logging implementation |
| 10.2.2 | Audit logs record required details | Timestamp, user, event type, success/failure, affected data |
| 10.3.1 | Audit logs protected against modification | Log file permissions, append-only configuration |

### PCI DSS Code-Level Detection Patterns

```
# PAN (Primary Account Number) in code
# Visa: starts with 4, 16 digits
# Mastercard: starts with 5[1-5] or 2[2-7], 16 digits
# Amex: starts with 3[47], 15 digits
# Discover: starts with 6011 or 65, 16 digits
Regex: \b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b

# CVV in code (should never be stored)
Variables named: cvv, cvc, cvv2, cvc2, security_code, card_code

# PAN in logs (violation of 3.4.1)
logger.info("Card number: " + pan)
console.log("Payment with card " + cardNumber)
```

---

## HIPAA — Health Insurance Portability and Accountability Act

### §164.312 Technical Safeguards

| Safeguard | Description | Code-Level Check | Maps to |
|-----------|-------------|------------------|---------|
| (a)(1) Access Control | Unique user identification | Auth system with unique IDs, no shared accounts | CWE-287 |
| (a)(2)(i) Unique User ID | Assign unique name/number | User model with unique identifiers | CWE-287 |
| (a)(2)(ii) Emergency Access | Procedures for emergency access | Break-glass procedure implementation | Design |
| (a)(2)(iii) Automatic Logoff | Session timeout implementation | Session expiry configuration, idle timeout | CWE-613 |
| (a)(2)(iv) Encryption/Decryption | Encrypt ePHI | Encryption at rest for health data fields | CWE-311 |
| (b) Audit Controls | Record and examine system activity | Audit logging for data access events | CWE-778 |
| (c)(1) Integrity | Protect ePHI from improper alteration | Input validation, access control on mutations | CWE-345 |
| (c)(2) Mechanism to authenticate ePHI | Verify data hasn't been altered | Data integrity checks (HMAC, checksums) | CWE-354 |
| (d) Person Authentication | Verify identity of persons seeking access | Authentication implementation quality | CWE-287 |
| (e)(1) Transmission Security | Protect ePHI during transmission | TLS enforcement, no HTTP for health data | CWE-319 |
| (e)(2)(i) Integrity Controls | Ensure ePHI not modified in transit | TLS, HMAC on messages | CWE-319 |
| (e)(2)(ii) Encryption | Encrypt ePHI in transit | TLS 1.2+ enforcement, certificate validation | CWE-326 |

### §164.308 Administrative Safeguards (Code-Relevant Subset)

| Safeguard | Description | Code-Level Check |
|-----------|-------------|------------------|
| (a)(1)(ii)(D) | Information system activity review | Log review process, log aggregation implementation |
| (a)(3)(ii)(A) | Role-based access | RBAC implementation for ePHI access |
| (a)(4)(ii)(B) | Access authorization | Authorization checks on ePHI endpoints |
| (a)(4)(ii)(C) | Access establishment and modification | User provisioning/deprovisioning implementation |
| (a)(5)(ii)(D) | Password management | Password policy, hashing, rotation enforcement |

### ePHI Identifiers — 18 Types to Detect in Code

The HIPAA Privacy Rule defines 18 identifier types that constitute Protected Health Information (PHI) when associated with health data:

| # | Identifier | Detection Patterns (variable names, field names, comments) |
|---|------------|-----------------------------------------------------------|
| 1 | Names | `patient_name`, `first_name`, `last_name`, `full_name`, `subscriber_name` |
| 2 | Geographic data (smaller than state) | `address`, `street`, `city`, `zip_code`, `postal_code`, `county` |
| 3 | Dates (except year) | `date_of_birth`, `dob`, `admission_date`, `discharge_date`, `death_date` |
| 4 | Phone numbers | `phone`, `telephone`, `mobile`, `fax`, `contact_number` |
| 5 | Fax numbers | `fax`, `fax_number` |
| 6 | Email addresses | `email`, `email_address`, `patient_email` |
| 7 | Social Security numbers | `ssn`, `social_security`, `social_security_number`, `ss_number` |
| 8 | Medical record numbers | `mrn`, `medical_record`, `medical_record_number`, `chart_number` |
| 9 | Health plan beneficiary numbers | `beneficiary_id`, `member_id`, `subscriber_id`, `plan_number` |
| 10 | Account numbers | `account_number`, `acct_no`, `patient_account` |
| 11 | Certificate/license numbers | `license_number`, `certificate_number`, `dea_number`, `npi` |
| 12 | Vehicle identifiers | `vin`, `vehicle_id`, `license_plate`, `plate_number` |
| 13 | Device identifiers | `device_id`, `serial_number`, `udi`, `device_identifier` |
| 14 | Web URLs | `url`, `web_address`, `patient_portal_url` |
| 15 | IP addresses | `ip_address`, `client_ip`, `source_ip` |
| 16 | Biometric identifiers | `fingerprint`, `retina`, `voiceprint`, `face_geometry`, `biometric` |
| 17 | Full-face photographs | `photo`, `photograph`, `face_image`, `patient_photo`, `headshot` |
| 18 | Any other unique identifier | `patient_id`, `unique_id`, `external_id`, `case_number` |

### ePHI Context Detection Keywords

Search for variables, fields, comments, and API endpoints containing:

```
patient, diagnosis, treatment, prescription, medication, medical,
health, PHI, ePHI, HIPAA, clinical, provider, insurance, beneficiary,
SSN, DOB, MRN, ICD, CPT, procedure, lab_result, vital_sign,
allergy, immunization, encounter, referral, claim, eligibility,
prior_auth, preauthorization, discharge, admission, prognosis
```

### HIPAA Violation Patterns in Code

```python
# ePHI in logs (VIOLATION)
logger.info(f"Patient {patient.name} SSN: {patient.ssn}")
print(f"Processing record for {patient.full_name}")

# ePHI in URLs (VIOLATION)
requests.get(f"/api/patients?ssn={ssn}")
redirect(f"/patient/{patient_ssn}/records")

# ePHI in error messages returned to client (VIOLATION)
return JsonResponse({"error": f"Patient {name} not found"})

# ePHI stored without encryption (VIOLATION)
cursor.execute("INSERT INTO patients (ssn, diagnosis) VALUES (%s, %s)", (ssn, diagnosis))
# Missing: application-level encryption before storage

# ePHI transmitted without TLS (VIOLATION)
requests.get("http://api.hospital.com/patient/123")  # HTTP, not HTTPS
```

---

## SOC 2 — Service Organization Control

### Trust Services Criteria Relevant to Code

| Criteria | Description | Code-Level Check |
|----------|-------------|------------------|
| CC6.1 | Logical and physical access controls | Authentication and authorization implementation |
| CC6.2 | Registration and authorization of users | User registration flow security, email verification |
| CC6.3 | Role-based access control | RBAC implementation, permission checks before data access |
| CC6.6 | Restrict access at system boundaries | API authentication on all endpoints, network segmentation in IaC |
| CC6.7 | Restrict transmission of data | TLS enforcement, encryption in transit, no plaintext sensitive data |
| CC6.8 | Prevent unauthorized software | Dependency integrity (lock files, hash verification, signed commits) |
| CC7.1 | Detection and monitoring | Logging implementation, structured logs, error monitoring setup |
| CC7.2 | Monitor for anomalies | Alert/monitoring configuration, rate limiting, anomaly detection |
| CC7.3 | Evaluate detected events | Incident response procedures (SECURITY.md, runbooks) |
| CC8.1 | Manage changes to infrastructure and software | Version control, CI/CD security, code review enforcement |

### SOC 2 Additional Criteria

| Criteria | Description | Code-Level Check |
|----------|-------------|------------------|
| A1.1 | Processing capacity meets demand | Auto-scaling configuration, resource limits, load testing |
| A1.2 | Environmental protections | Backup implementation, disaster recovery config |
| A1.3 | Recovery procedures | Backup restoration process, failover configuration |
| C1.1 | Confidential information identified and protected | Data classification in code, encryption for classified data |
| C1.2 | Confidential information disposed securely | Secure deletion implementation, data retention policies |
| PI1.1 | Privacy notice and consent | Consent collection implementation, privacy policy endpoint |
| PI1.2 | Choice and consent | Opt-in/opt-out mechanisms, preference management |
| PI1.3 | Personal information collected for stated purposes | Data collection matches privacy policy claims |

### SOC 2 Code-Level Detection

```python
# Missing authentication on API endpoint (CC6.1 violation)
@app.route('/api/users', methods=['GET'])
def get_users():
    return jsonify(User.query.all())  # No auth check

# Should be:
@app.route('/api/users', methods=['GET'])
@require_auth
@require_role('admin')
def get_users():
    audit_log('user_list_accessed', current_user)
    return jsonify(User.query.all())

# Missing audit logging (CC7.1 violation)
def delete_user(user_id):
    User.query.get(user_id).delete()  # No logging
    db.session.commit()

# No rate limiting (CC7.2 gap)
@app.route('/api/login', methods=['POST'])
def login():  # No rate limiter decorator/middleware
    ...
```

---

## GDPR — General Data Protection Regulation

### Article 25: Data Protection by Design and Default

| Principle | Code-Level Check |
|-----------|------------------|
| Data minimization | Only collect necessary fields; no over-collection; SELECT specific columns, not SELECT * |
| Purpose limitation | Data used only for stated purpose; no repurposing without consent |
| Storage limitation | Data retention/deletion implementation; TTL on records; automated cleanup jobs |
| Integrity and confidentiality | Encryption, access controls, audit logging |
| Pseudonymization | Anonymization/pseudonymization of PII where possible; hashed identifiers |

### Article 32: Security of Processing

| Measure | Code-Level Check |
|---------|------------------|
| Encryption of personal data | Encryption at rest and in transit for PII fields |
| Confidentiality, integrity, availability | Access controls, input validation, redundancy/failover |
| Resilience of processing systems | Error handling, circuit breakers, graceful degradation, backup config |
| Regular testing and evaluation | Test suite covering security controls, security test cases |

### Data Subject Rights — Code Implementation Checks

| Right | Article | What to Check in Code |
|-------|---------|----------------------|
| Right to access | Art. 15 | Data export/download endpoint exists; returns all data held on subject |
| Right to rectification | Art. 16 | Data update endpoints for PII fields; user-accessible profile editing |
| Right to erasure ("right to be forgotten") | Art. 17 | Data deletion endpoint; cascading deletes across all stores; backup purge consideration |
| Right to restrict processing | Art. 18 | Ability to flag/pause processing of specific user records; processing status field |
| Right to data portability | Art. 20 | Data export in machine-readable format (JSON, CSV); downloadable by user |
| Right to object | Art. 21 | Opt-out mechanism implementation; marketing consent toggle; processing objection endpoint |
| Right not to be subject to automated decisions | Art. 22 | Human review mechanism for automated decisions; override capability |

### GDPR PII Detection Patterns

Search for fields, variables, database columns, and API parameters matching:

```
# Direct identifiers
email, phone, address, name, surname, first_name, last_name,
full_name, username, user_name

# Government identifiers
dob, date_of_birth, ssn, social_security, passport, passport_number,
national_id, tax_id, drivers_license

# Location data
ip_address, ip, client_ip, location, gps, latitude, longitude,
geo, geolocation, coordinates, postal_code, zip_code

# Device/browser identifiers
cookie, session_id, device_id, fingerprint, user_agent,
advertising_id, idfa, gaid

# Financial
bank_account, iban, credit_card, card_number, billing_address

# Biometric / special category
biometric, fingerprint, face_id, health_data, genetic,
racial_origin, ethnic_origin, political_opinion,
religious_belief, sexual_orientation, trade_union
```

### GDPR Violation Patterns in Code

```python
# Over-collection (data minimization violation)
# Collecting fields not needed for the service
user_data = {
    'name': form.name,
    'email': form.email,
    'phone': form.phone,         # Not needed for newsletter
    'address': form.address,     # Not needed for newsletter
    'dob': form.date_of_birth,   # Not needed for newsletter
}

# No retention/deletion mechanism (storage limitation violation)
# Data stored indefinitely with no TTL or cleanup
db.users.insert(user_data)  # No expiry, no deletion job

# PII in logs (integrity/confidentiality violation)
logger.info(f"New user registered: {user.email}, {user.phone}")

# Missing consent tracking (lawfulness violation)
def subscribe_to_marketing(email):
    add_to_mailing_list(email)  # No consent record created

# Should include:
def subscribe_to_marketing(email, consent_source):
    record_consent(email, 'marketing', consent_source, datetime.utcnow())
    add_to_mailing_list(email)

# No data export endpoint (portability violation)
# API has no endpoint for users to download their data

# Missing cascading delete (erasure violation)
def delete_user(user_id):
    db.users.delete(user_id)
    # Missing: db.orders.anonymize(user_id)
    # Missing: db.logs.purge(user_id)
    # Missing: db.analytics.anonymize(user_id)
    # Missing: cache.invalidate(user_id)
    # Missing: search_index.remove(user_id)
    # Missing: third_party_api.request_deletion(user_id)
```

### GDPR Special Category Data (Article 9)

Extra protection required for:
- Racial or ethnic origin
- Political opinions
- Religious or philosophical beliefs
- Trade union membership
- Genetic data
- Biometric data (for identification)
- Health data
- Sex life or sexual orientation

**Code detection**: Search for field names, enums, or comments referencing these categories. If found, verify:
1. Explicit consent or legal basis documented
2. Higher encryption standard applied
3. Stricter access controls than standard PII
4. Separate storage/database consideration

---

## NIST SP 800-53 (Federal Systems)

### Selected Controls Detectable in Code

| Control | Description | Code-Level Check |
|---------|-------------|------------------|
| AC-2 | Account Management | User lifecycle management (create, disable, delete) |
| AC-3 | Access Enforcement | Authorization checks on all protected resources |
| AC-6 | Least Privilege | Minimal permissions granted, no wildcard permissions |
| AC-7 | Unsuccessful Logon Attempts | Account lockout after failed attempts |
| AU-2 | Event Logging | Security-relevant events logged |
| AU-3 | Content of Audit Records | Logs contain: what, when, where, who, outcome |
| AU-8 | Time Stamps | UTC timestamps, NTP synchronization |
| AU-9 | Protection of Audit Information | Log integrity, tamper protection |
| IA-2 | Identification and Authentication | Multi-factor authentication implementation |
| IA-5 | Authenticator Management | Password hashing (bcrypt/argon2), key rotation |
| SC-8 | Transmission Confidentiality | TLS enforcement for data in transit |
| SC-12 | Cryptographic Key Management | Key storage, rotation, and destruction |
| SC-13 | Cryptographic Protection | FIPS-approved algorithms (AES-256, SHA-256+) |
| SC-28 | Protection of Information at Rest | Encryption at rest for sensitive data |
| SI-3 | Malicious Code Protection | Input validation, output encoding |
| SI-10 | Information Input Validation | Server-side validation on all inputs |
| SI-11 | Error Handling | No sensitive data in error messages |

---

## OWASP ASVS 4.0 — Application Security Verification Standard

### Mapping to Vulnerability Taxonomy

| ASVS Chapter | Key Requirements | Maps to CWE |
|---------------|-----------------|-------------|
| V1: Architecture | Threat modeling, secure design | Design |
| V2: Authentication | Password policy, MFA, session management | CWE-287, 384, 613 |
| V3: Session Management | Session timeout, token entropy, fixation prevention | CWE-384, 613 |
| V4: Access Control | RBAC, IDOR prevention, privilege escalation | CWE-285, 639, 269 |
| V5: Validation | Input validation, output encoding, injection prevention | CWE-20, 79, 89, 78 |
| V6: Cryptography | Algorithm strength, key management, random number generation | CWE-327, 326, 338 |
| V7: Error Handling | Generic error messages, no stack traces to users | CWE-209, 532 |
| V8: Data Protection | PII handling, sensitive data in transit/at rest | CWE-311, 312, 319 |
| V9: Communication | TLS configuration, certificate validation | CWE-295, 319 |
| V10: Malicious Code | No backdoors, no time bombs, integrity verification | CWE-506, 511 |
| V11: Business Logic | Rate limiting, anti-automation, workflow integrity | CWE-799, 837 |
| V12: Files | Upload validation, path traversal prevention | CWE-434, 22 |
| V13: API | REST/GraphQL security, mass assignment prevention | CWE-915, 285 |
| V14: Configuration | Security headers, dependency management | CWE-16, 1104 |

---

## Cross-Framework Mapping

Maps vulnerability findings to all applicable compliance requirements simultaneously:

| CWE | Vulnerability | PCI DSS 4.0 | HIPAA | SOC 2 | GDPR | NIST 800-53 |
|-----|--------------|-------------|-------|-------|------|-------------|
| CWE-79 | Cross-Site Scripting (XSS) | 6.2.4, 6.4.1 | §164.312(c)(1) | CC6.1 | Art. 32 | SI-10 |
| CWE-89 | SQL Injection | 6.2.4, 6.4.1 | §164.312(c)(1) | CC6.1 | Art. 32 | SI-10 |
| CWE-78 | OS Command Injection | 6.2.4 | §164.312(c)(1) | CC6.1 | Art. 32 | SI-10 |
| CWE-22 | Path Traversal | 6.2.4 | §164.312(a)(1) | CC6.1 | Art. 32 | AC-3 |
| CWE-287 | Improper Authentication | 8.2.1, 8.3.1 | §164.312(d) | CC6.1, CC6.2 | Art. 32 | IA-2 |
| CWE-311 | Missing Encryption | 3.4.1, 4.2.1 | §164.312(a)(2)(iv) | CC6.7 | Art. 32 | SC-28 |
| CWE-319 | Cleartext Transmission | 4.2.1 | §164.312(e)(1) | CC6.7 | Art. 32 | SC-8 |
| CWE-326 | Inadequate Encryption Strength | 3.5.1 | §164.312(e)(2)(ii) | CC6.7 | Art. 32 | SC-13 |
| CWE-327 | Broken Cryptographic Algorithm | 3.5.1 | §164.312(a)(2)(iv) | CC6.7 | Art. 32 | SC-13 |
| CWE-352 | Cross-Site Request Forgery | 6.2.4 | §164.312(c)(1) | CC6.1 | Art. 32 | SI-10 |
| CWE-434 | Unrestricted File Upload | 6.2.4 | §164.312(c)(1) | CC6.1 | Art. 32 | SI-10 |
| CWE-502 | Unsafe Deserialization | 6.2.4 | §164.312(c)(1) | CC6.1 | Art. 32 | SI-10 |
| CWE-532 | Info Exposure Through Logs | 10.2.2 | §164.312(b) | CC7.1 | Art. 25 | AU-9, SI-11 |
| CWE-613 | Insufficient Session Expiration | 8.2.8 | §164.312(a)(2)(iii) | CC6.1 | Art. 32 | AC-12 |
| CWE-639 | IDOR | 6.2.4 | §164.312(a)(1) | CC6.3 | Art. 32 | AC-3 |
| CWE-778 | Insufficient Logging | 10.2.1 | §164.312(b) | CC7.1 | Art. 32 | AU-2 |
| CWE-798 | Hardcoded Credentials | 8.6.1 | §164.312(d) | CC6.1 | Art. 32 | IA-5 |
| CWE-918 | Server-Side Request Forgery | 6.2.4 | §164.312(c)(1) | CC6.6 | Art. 32 | SC-7 |
| CWE-1104 | Unmaintained Third-Party Components | 6.3.1, 6.3.2 | §164.308(a)(1) | CC6.8 | Art. 32 | SI-2 |

---

## Compliance Reporting Format

When `--compliance` flag is used, append this section to the security audit report:

```markdown
## Compliance Assessment: [FRAMEWORK NAME]

### Summary
- Requirements checked: XX
- Passed: XX
- Failed: XX
- Not Applicable: XX
- Compliance score: XX%

### Requirement-by-Requirement Status

| Requirement | Status | Finding | Remediation |
|-------------|--------|---------|-------------|
| [Req ID] | PASS/FAIL/NA | [VULN-XXX if failed, or "Verified" if passed] | [Fix guidance or N/A] |

### Critical Failures
[List any FAIL items that would block certification/attestation]

### Recommendations
[Prioritized list of changes needed for compliance]
```

### Multi-Framework Report

When multiple `--compliance` flags are specified (e.g., `--compliance pci --compliance hipaa`), generate a combined report:

```markdown
## Multi-Framework Compliance Assessment

### Cross-Framework Summary
| Framework | Checked | Passed | Failed | N/A | Score |
|-----------|---------|--------|--------|-----|-------|
| PCI DSS 4.0 | XX | XX | XX | XX | XX% |
| HIPAA | XX | XX | XX | XX | XX% |
| SOC 2 | XX | XX | XX | XX | XX% |
| GDPR | XX | XX | XX | XX | XX% |

### Shared Findings
[Findings that affect multiple frameworks — fix once, satisfy many]

### Framework-Specific Findings
[Findings unique to a single framework]
```

### Compliance Evidence Collection

For each PASS determination, record the evidence:

```markdown
| Requirement | Evidence Type | Location | Details |
|-------------|--------------|----------|---------|
| PCI 6.2.4 (SQLi) | Code pattern | src/db/queries.ts:45 | Parameterized queries used throughout |
| HIPAA §164.312(e)(1) | Configuration | lib/http-client.ts:12 | TLS 1.2 minimum enforced |
| SOC 2 CC7.1 | Implementation | src/middleware/logger.ts | Structured logging with audit events |
| GDPR Art. 17 | Endpoint | src/api/users/delete.ts | Cascading delete with third-party notification |
```
