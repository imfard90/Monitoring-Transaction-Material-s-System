-- Migration 020: Add API Key and API Approval to auth.user
-- Used for external API authentication and authorization (GET /api/v1/stock)

ALTER TABLE auth.user 
ADD COLUMN IF NOT EXISTS api_key TEXT;

ALTER TABLE auth.user 
ADD COLUMN IF NOT EXISTS appr_api BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure fast lookup by API key hash and enforce uniqueness (1 user per active key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_user_api_key 
ON auth.user (api_key) 
WHERE api_key IS NOT NULL;
