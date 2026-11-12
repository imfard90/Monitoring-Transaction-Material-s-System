-- Migration 060: Setup MFA TOTP Authenticator, Trusted Devices (Max 3), and Authentication Audit Logs
-- Aligned with Better Auth twoFactor plugin and MTMS Enterprise Security Policies

-- 1. Tambahkan kolom twoFactorEnabled pada tabel auth.user jika belum ada
ALTER TABLE auth."user"
    ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT FALSE;

-- 2. Buat tabel auth.twoFactor untuk plugin twoFactor Better Auth
CREATE TABLE IF NOT EXISTS auth."twoFactor" (
    id TEXT PRIMARY KEY,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
    "verified" BOOLEAN DEFAULT TRUE,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_twofactor_user_id ON auth."twoFactor" ("userId");

-- 3. Tabel auth.user_trusted_devices untuk pencatatan dan pembatasan maksimal 3 perangkat terpercaya per user
CREATE TABLE IF NOT EXISTS auth.user_trusted_devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    device_fingerprint TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON auth.user_trusted_devices (user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON auth.user_trusted_devices (user_id, device_fingerprint);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trusted_devices_active ON auth.user_trusted_devices (user_id, device_fingerprint) WHERE is_revoked = false;

-- 4. Tabel auth.auth_audit_logs untuk rekam jejak peristiwa autentikasi lengkap
CREATE TABLE IF NOT EXISTS auth.auth_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT REFERENCES auth."user"(id) ON DELETE SET NULL,
    nik TEXT,
    event_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_name TEXT,
    device_fingerprint TEXT,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_id ON auth.auth_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_created_at ON auth.auth_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event_type ON auth.auth_audit_logs (event_type);

-- 5. Row Level Security (RLS) enforcement per MTMS standards (§3.3)
ALTER TABLE auth."twoFactor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth."twoFactor" FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'auth' AND tablename = 'twoFactor' AND policyname = 'twofactor_all') THEN
        CREATE POLICY twofactor_all ON auth."twoFactor" FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

ALTER TABLE auth.user_trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.user_trusted_devices FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'auth' AND tablename = 'user_trusted_devices' AND policyname = 'user_trusted_devices_all') THEN
        CREATE POLICY user_trusted_devices_all ON auth.user_trusted_devices FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

ALTER TABLE auth.auth_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.auth_audit_logs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'auth' AND tablename = 'auth_audit_logs' AND policyname = 'auth_audit_logs_all') THEN
        CREATE POLICY auth_audit_logs_all ON auth.auth_audit_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;


