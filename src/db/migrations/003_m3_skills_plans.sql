CREATE TABLE IF NOT EXISTS skill_ingestions (
  ingestion_id UUID PRIMARY KEY,
  installation_id UUID NOT NULL,
  repo_url TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  ingestion_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_ingestions_installation_created
  ON skill_ingestions (installation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS skill_specs (
  id BIGSERIAL PRIMARY KEY,
  installation_id UUID NOT NULL,
  skill_id TEXT NOT NULL,
  version TEXT NOT NULL,
  source_repo TEXT NOT NULL,
  source_commit_sha TEXT NOT NULL,
  source_path TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  inputs_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  outputs_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  tool_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  caps JSONB NOT NULL DEFAULT '{}'::jsonb,
  safety_class TEXT NOT NULL,
  deprecated BOOLEAN NOT NULL DEFAULT FALSE,
  ingestion_id UUID NOT NULL REFERENCES skill_ingestions(ingestion_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_specs_version_commit
  ON skill_specs (installation_id, skill_id, version, source_commit_sha);

CREATE INDEX IF NOT EXISTS idx_skill_specs_installation_skill
  ON skill_specs (installation_id, skill_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS plans (
  plan_id UUID PRIMARY KEY,
  installation_id UUID NOT NULL,
  wp_user_id BIGINT NOT NULL,
  skill_id TEXT NOT NULL,
  policy_preset TEXT NOT NULL,
  status TEXT NOT NULL,
  goal TEXT NOT NULL,
  assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimates JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_hash TEXT NOT NULL,
  validation_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_usage_tokens INT NOT NULL DEFAULT 0,
  llm_model TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_installation_user_created
  ON plans (installation_id, wp_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plans_installation_status
  ON plans (installation_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS plan_events (
  id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_events_plan_created
  ON plan_events (plan_id, created_at ASC);
