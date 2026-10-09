# Terraform Security Patterns

## Critical Misconfigurations

| Pattern | Risk | Severity | CWE | Fix |
|---------|------|----------|-----|-----|
| `acl = "public-read"` on S3 | Public data exposure | CRITICAL | CWE-284 | Use bucket policy with explicit access |
| `Action = "*", Resource = "*"` in IAM | God-mode access | CRITICAL | CWE-269 | Least-privilege policies |
| Security group `ingress 0.0.0.0/0` on non-80/443 | Open network access | HIGH | CWE-284 | Restrict to specific CIDRs |
| `encrypted = false` on EBS/RDS/S3 | Data at rest unencrypted | HIGH | CWE-311 | Enable encryption with KMS |
| Hardcoded `access_key`/`secret_key` in .tf | Credential exposure | CRITICAL | CWE-798 | Use environment vars or IAM roles |
| `publicly_accessible = true` on RDS | Database on internet | CRITICAL | CWE-284 | Set false, use VPC |
| Missing `logging {}` on S3/CloudTrail | No audit trail | MEDIUM | CWE-778 | Enable logging |
| `versioning { enabled = false }` on S3 | No recovery | MEDIUM | CWE-693 | Enable versioning |
| State file without encryption/remote backend | State contains secrets in plaintext | HIGH | CWE-312 | Use S3 backend with encryption + DynamoDB lock |
| `force_destroy = true` on S3 with data | Data loss risk | MEDIUM | CWE-693 | Remove or protect with lifecycle |
| `deletion_protection = false` on RDS | Accidental deletion | MEDIUM | CWE-693 | Enable deletion protection |
| Missing `tags {}` on resources | Compliance gap | LOW | N/A | Add required tags |

## AWS-Specific Patterns

### EC2
```hcl
# DANGEROUS: Secrets in user_data (visible in instance metadata)
resource "aws_instance" "web" {
  user_data = <<-EOF
    export DB_PASSWORD="supersecret"  # CRITICAL: CWE-798
  EOF
}

# DANGEROUS: IMDSv1 allows SSRF to steal credentials
resource "aws_instance" "web" {
  # Missing metadata_options block = IMDSv1 enabled by default
}

# SAFE:
resource "aws_instance" "web" {
  metadata_options {
    http_tokens = "required"  # Forces IMDSv2
  }
}
```

### Lambda
```hcl
# DANGEROUS: Overpermissioned Lambda role
resource "aws_iam_role_policy" "lambda" {
  policy = jsonencode({
    Statement = [{
      Action   = "*"        # CRITICAL: God mode
      Resource = "*"
      Effect   = "Allow"
    }]
  })
}
```

### S3
```hcl
# DANGEROUS: Public bucket
resource "aws_s3_bucket_acl" "public" {
  acl = "public-read"  # CRITICAL
}

# DANGEROUS: No encryption
resource "aws_s3_bucket" "data" {
  # Missing server_side_encryption_configuration = unencrypted
}

# SAFE:
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}
```

### API Gateway
```hcl
# DANGEROUS: No authorization
resource "aws_api_gateway_method" "any" {
  authorization = "NONE"  # HIGH: Open API endpoint
}
```

## GCP-Specific Patterns

| Pattern | Risk | Fix |
|---------|------|-----|
| `allUsers` or `allAuthenticatedUsers` in IAM binding | Public access | Use specific service accounts |
| `uniform_bucket_level_access = false` on GCS | ACL confusion | Enable uniform access |
| Default service account on Compute/GKE | Overpermissioned | Create dedicated SA |
| Firewall rule `source_ranges = ["0.0.0.0/0"]` on non-web ports | Open network | Restrict source ranges |
| Cloud SQL `require_ssl = false` | Unencrypted DB connections | Enable SSL |

## Azure-Specific Patterns

| Pattern | Risk | Fix |
|---------|------|-----|
| Storage account `allow_blob_public_access = true` | Public blob access | Set false |
| NSG rule `source_address_prefix = "*"` | Open network | Restrict to specific ranges |
| Key Vault without access policies | No secret management | Configure access policies |
| App Service `https_only = false` | HTTP allowed | Enable HTTPS only |
| `min_tls_version` < "1.2" | Weak TLS | Set to "1.2" minimum |

## Detection Checklist

- [ ] No hardcoded credentials in any .tf file
- [ ] State stored remotely with encryption
- [ ] All storage encrypted at rest
- [ ] Network access follows least-privilege
- [ ] IAM policies follow least-privilege
- [ ] Logging enabled for all services
- [ ] All resources properly tagged
- [ ] Deletion protection on critical resources
- [ ] VPC/network isolation configured
- [ ] No public access unless explicitly required
