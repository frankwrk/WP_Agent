CREATE TABLE IF NOT EXISTS runs (
  run_id UUID PRIMARY KEY,
  installation_id UUID NOT NULL,
  wp_user_id BIGINT NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  planned_steps INT NOT NULL DEFAULT 0,
  planned_tool_calls INT NOT NULL DEFAULT 0,
  planned_pages INT NOT NULL DEFAULT 0,
  actual_tool_calls INT NOT NULL DEFAULT 0,
  actual_pages INT NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  rollback_available BOOLEAN NOT NULL DEFAULT FALSE,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runs_installation_user_created
  ON runs (installation_id, wp_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_plan
  ON runs (plan_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_active_installation
  ON runs (installation_id)
  WHERE status IN ('queued', 'running', 'rolling_back');

CREATE TABLE IF NOT EXISTS run_steps (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL,
  planned_tool_calls INT NOT NULL DEFAULT 0,
  planned_pages INT NOT NULL DEFAULT 0,
  actual_tool_calls INT NOT NULL DEFAULT 0,
  actual_pages INT NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (run_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run
  ON run_steps (run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS run_events (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_created
  ON run_events (run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS run_rollbacks (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  handle_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_run_rollbacks_handle
  ON run_rollbacks (run_id, handle_id);

CREATE INDEX IF NOT EXISTS idx_run_rollbacks_run_created
  ON run_rollbacks (run_id, created_at ASC);
