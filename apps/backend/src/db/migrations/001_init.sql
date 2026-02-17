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
