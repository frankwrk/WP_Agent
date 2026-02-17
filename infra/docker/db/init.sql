CREATE TABLE IF NOT EXISTS installations (
  id BIGSERIAL PRIMARY KEY,
  installation_id UUID UNIQUE NOT NULL,
  site_url TEXT NOT NULL,
  wp_public_key TEXT NOT NULL,
  backend_public_key_id TEXT,
  signature_alg TEXT NOT NULL DEFAULT 'ed25519',
  status TEXT NOT NULL DEFAULT 'paired',
  plugin_version TEXT,
  paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pairing_audit (
  id BIGSERIAL PRIMARY KEY,
  installation_id UUID,
  site_url TEXT,
  outcome_code TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pairing_audit_installation
  ON pairing_audit (installation_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id UUID PRIMARY KEY,
  installation_id UUID NOT NULL,
  wp_user_id BIGINT NOT NULL,
  policy_preset TEXT NOT NULL,
  context_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_installation_user
  ON chat_sessions (installation_id, wp_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  usage_tokens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON chat_messages (session_id, created_at ASC);
