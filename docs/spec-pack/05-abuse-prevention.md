# Abuse Prevention (M4)

## Scope

M4 extends controls into execute phase for draft-only write operations.

## Enforced Controls

### 1) Auth path remains mandatory

- Browser -> WP admin proxy (`nonce` + capability)
- WP admin proxy -> backend (`X-WP-Agent-Bootstrap`)

### 2) Commit pinning for skill ingestion

- Skills sync requires explicit `commit_sha`
- Floating refs are rejected (`SKILL_COMMIT_REQUIRED`)
- Ingestion provenance is stored (`repo_url`, `commit_sha`, hash)

### 3) Tool allowlist and registry checks

- Unknown tools fail ingestion (`SKILL_UNKNOWN_TOOL`)
- Draft plans must reference tools in:
  - static backend registry, and
  - installation WP manifest, and
  - selected skill allowlist

### 4) Policy-enforced LLM planning call

Planner draft uses one bounded LLM call through backend policy stack:

- policy preset model routing
- per-minute rate limiting
- daily token budget checks

### 5) Deterministic server-side estimate/risk

Estimate and risk are computed server-side only and enforce caps with machine-readable codes.

### 6) Execute gating and concurrency lock (M4)

- `POST /runs` requires:
  - bootstrap auth,
  - paired installation,
  - plan scope ownership,
  - `approved` plan status.
- One active run per installation is enforced (`RUN_ACTIVE_CONFLICT`).

### 7) Draft-only write semantics (M4)

- Write tools force `post_status=draft` server-side.
- Runtime caps are enforced on steps, tool calls, and pages.
- Bulk operations are async and bounded (`RUN_MAX_PAGES_PER_BULK`).

### 8) Explicit rollback semantics (M4)

- Failures store rollback handles and mark rollback availability.
- No automatic rollback; operator must call rollback endpoint explicitly.

## Data for Auditability

- `skill_ingestions`
- `skill_specs`
- `plans`
- `plan_events`
- `runs`
- `run_steps`
- `run_events`
- `run_rollbacks`
- WP `wp_agent_audit_log`
- WP `wp_agent_rollback_handles`
- WP `wp_agent_jobs`

Each plan stores validation issues, estimates, risk, model/tokens, and plan hash for traceability.
