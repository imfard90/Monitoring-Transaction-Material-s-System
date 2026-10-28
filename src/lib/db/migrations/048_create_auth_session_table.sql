-- Migration 048: Create auth.session table for session tracking
-- Author: MTMS Core
-- Purpose: Support Better Auth session persistence and single-session enforcement in PostgreSQL

CREATE TABLE IF NOT EXISTS auth.session (
    id TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    token TEXT NOT NULL UNIQUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL REFERENCES auth.user(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user_id ON auth.session("userId");
CREATE INDEX IF NOT EXISTS idx_auth_session_token ON auth.session(token);
CREATE INDEX IF NOT EXISTS idx_auth_session_expires_at ON auth.session("expiresAt");

-- Enable Row Level Security (RLS)
ALTER TABLE auth.session ENABLE ROW LEVEL SECURITY;

-- Allow service role / postgres / authenticated application users to access sessions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'auth' AND tablename = 'session' AND policyname = 'auth_session_all'
    ) THEN
        CREATE POLICY auth_session_all ON auth.session
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

