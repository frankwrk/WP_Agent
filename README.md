# WP Agent Backend

This service is the **orchestrator + policy authority** for WP Agent.

It exposes `/api/v1/*` endpoints consumed by the WordPress admin proxy, and it performs:

- installation pairing + trust bootstrapping
- skill ingestion + normalization + provenance
- plan generation (LLM) + strict parsing + validation + deterministic estimate/risk/hash
- run execution state machine (tool calls into WordPress) + rollback orchestration
- usage metering + policy enforcement (rate limits, budgets, caps)

> WordPress never stores LLM provider keys. All LLM access and cost controls live here.

---

## High-level architecture

### Trust boundaries

- WordPress generates and stores its **installation keypair**.
- The backend stores the **WP public key** received during pairing.
- Backend → WP tool calls are **signed** (Ed25519) using canonical request strings.
- The WP plugin verifies signatures, TTL, audience, idempotency, and rate limits before executing tools.

See: `../06-security-protocols.md`

### Request flow (admin UI → WP → backend)

1. Browser calls `wp-agent-admin/v1/*` with WP REST nonce.
2. WP admin proxy validates nonce + `manage_options`.
3. WP proxy calls backend `/api/v1/*` with `X-WP-Agent-Bootstrap` and scoped identity.
4. Backend enforces installation/user scope + policy limits.
5. Backend returns normalized JSON contracts for the UI.

---

## Core concepts

### Installation

A paired WordPress site instance.

- Identified by `installation_id`
- Pairing stores the WP public key and audit events.

Routes: `src/routes/installations.ts`  
Service: `src/services/wp/*` + `src/services/policy/*`

### Skill

A normalized “capability spec” ingested from a pinned Git commit.

- Source is pinned by `repo_url + commit_sha`
- Ingestion is idempotent by content hash
- Skills include tool allowlists used during plan validation.

Routes: `src/routes/skills.ts`  
Service: `src/services/skills/*`

### Plan (Plan Contract v1)

A deterministic, strictly parsed JSON plan produced by one bounded LLM call.
Backend computes:

- `plan_hash` (sha256 of canonical JSON)
- estimate + risk
- validation issues and gating codes

Routes: `src/routes/*` (plans live under `services/plans/*`)  
Contract: `../03-plan-contract.md`

### Run

Execution of an **approved** plan.

- Backend is responsible for step-by-step execution and caps.
- WP is responsible for applying tool calls, persisting audit logs, and storing rollback handles.

Routes: `src/routes/runs.ts`  
Service: `src/services/runs/*`

---

## Folder guide

- `src/routes/`
  - HTTP endpoints (`health`, `installations`, `sessions`, `skills`, `runs`)
- `src/services/llm/`
  - Vercel AI SDK client + model selection for task classes
- `src/services/policy/`
  - per-request + per-day enforcement (rate limits, budgets, caps)
- `src/services/skills/`
  - repo ingestion, normalization, allowlist validation, persistence
- `src/services/plans/`
  - planner call, strict parse, schema validation, estimate/risk/hash
- `src/services/runs/`
  - execution state machine + rollback orchestration
- `src/services/wp/`
  - WP manifest/tool-call client, signing, canonicalization helpers
- `src/utils/`
  - `canonical-json`: deterministic JSON for hashing/signatures
  - `http-envelope`: consistent `{ meta, data, error }` responses
  - `redaction`: log-safe handling of secrets/PII
  - `log`: structured logging
- `src/types/`
  - shared contracts (`plan`, `skill`, `tool`)

`dist/` is compiled output (do not edit directly).

---

## Running locally

### Prerequisites

- Node.js (project-defined version)
- Postgres (usually via docker compose in the repo root)

### Environment variables (common)

- `PORT`
- `DATABASE_URL`
- `AI_GATEWAY_API_KEY`
- `AI_GATEWAY_BASE_URL` (if applicable)
- `PAIRING_BOOTSTRAP_SECRET`
- `BACKEND_SIGNING_PRIVATE_KEY` (base64 Ed25519 64-byte secret key)
- `BACKEND_SIGNING_AUDIENCE`
- `SIGNATURE_TTL_SECONDS`
- `SIGNATURE_MAX_SKEW_SECONDS`
- `RUN_RECOVERY_STALE_MINUTES` (optional, default `15`)
- `RUN_WORKER_POLL_INTERVAL_MS` (optional, default `1000`)
- `SKILLS_SYNC_TIMEOUT_MS` (optional, default `20000`)
- `SKILLS_SYNC_MAX_DOCUMENTS` (optional, default `200`)
- `PLAN_DRAFT_LLM_TIMEOUT_MS` (optional, default `25000`)
- `PLAN_DRAFT_MANIFEST_TIMEOUT_MS` (optional, default `10000`)
- `PLAN_DRAFT_MAX_OUTPUT_CHARS` (optional, default `30000`)
- Optional model routing overrides (if your config supports it)

Production boot is fail-fast: when `NODE_ENV=production`, the server refuses to start unless
`DATABASE_URL`, `PAIRING_BOOTSTRAP_SECRET`, `BACKEND_SIGNING_PRIVATE_KEY`,
`BACKEND_SIGNING_AUDIENCE`, `SIGNATURE_TTL_SECONDS`, and `SIGNATURE_MAX_SKEW_SECONDS`
are configured.

Run recovery is executed during backend startup: active runs in `queued`, `running`, or
`rolling_back` with stale `COALESCE(started_at, created_at)` older than
`RUN_RECOVERY_STALE_MINUTES` are marked `failed` with `RUN_EXECUTION_ABORTED` and receive a
`run_recovered_failed` audit event.

Run execution is handled by an in-process worker loop. `POST /api/v1/runs` only persists a
`queued` run and returns `run_id`; a background worker claims queued runs with DB lease semantics
and executes them outside the HTTP request lifecycle.

Heavy synchronous operations are guarded with explicit caps/timeouts:

- `POST /api/v1/skills/sync`: ingest timeout and max-document cap
- `POST /api/v1/plans/draft`: LLM timeout, manifest timeout, and max planner-output size cap

Both routes now emit stage timing metadata in response `meta.progress` with `meta.elapsed_ms`.

### Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`

---

## API response envelope + request IDs

All `/api/v1/*` responses include:

- `x-request-id` header
- `meta.request_id` in JSON body

This ID also correlates:

- LLM provider request IDs
- WP signed tool-call request IDs

---

## Security notes (non-negotiables)

- Never log secrets. Always route sensitive values through `utils/redaction.ts`.
- Never execute WP tools without signature headers + TTL + audience verification on the WP side.
- Enforce policy **before** LLM calls and **before** starting runs.
- Treat all planner output as hostile until strict-JSON parsed + validated.
