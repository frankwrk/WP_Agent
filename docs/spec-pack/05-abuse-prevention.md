# Abuse Prevention (M3)

## Scope

M3 extends abuse controls to skills ingestion and planner draft generation.

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

### 6) Approval-only M3 semantics

`POST /plans/:id/approve` only transitions `validated -> approved` and appends an audit event.
No execution side effects are allowed in M3.

## Data for Auditability

- `skill_ingestions`
- `skill_specs`
- `plans`
- `plan_events`

Each plan stores validation issues, estimates, risk, model/tokens, and plan hash for traceability.
