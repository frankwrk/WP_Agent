# Architecture Notes (M4)

## Admin UI Pages

React admin pages now include:

- `Connect` (pairing status + pair action)
- `Chat` (M2 read-only session chat)
- `Skills` (M3 skill explorer + plan preview + approve action)
- `Skills` execute panel (M4 run start, timeline, rollback)

Implemented in:

- `/Users/frank/dev/Code/Work/WP_Agent/apps/wp-plugin/admin/src/pages/Connect.tsx`
- `/Users/frank/dev/Code/Work/WP_Agent/apps/wp-plugin/admin/src/pages/Chat.tsx`
- `/Users/frank/dev/Code/Work/WP_Agent/apps/wp-plugin/admin/src/pages/Skills.tsx`

## Request Flow

1. Browser calls `wp-agent-admin/v1/*` with WP REST nonce.
2. WP admin proxy validates nonce + `manage_options` capability.
3. WP proxy calls backend `api/v1/*` with `X-WP-Agent-Bootstrap`.
4. Backend enforces installation scope and policy limits.
5. Backend returns normalized contracts for UI rendering.

## API Request ID Integrity

- All backend `/api/v1/*` responses include `x-request-id` header.
- All JSON envelope responses include `meta.request_id` with the same value.
- LLM and WP tool-call logs include correlatable IDs for search:
  - `requestId` (HTTP request)
  - `llmRequestId` / `providerRequestId` (LLM calls)
  - `toolRequestId` (signed WP tool calls during run execution)

## LLM Routing

- Backend LLM calls use Vercel AI SDK with OpenAI-compatible transport pointed at Vercel AI Gateway.
- Call sites pass plain `provider/model` IDs (for example `anthropic/claude-sonnet-4.5`) selected by task class and preference.
- Model selection is centralized in `apps/backend/src/services/llm/models.ts` with deterministic fallback lists and optional env overrides.
- Selection logs include `routingReason` so each model decision is explainable and reproducible.
- Policy limits (rate/budget/input caps) remain enforced before any model call.

## M3 Skills + Plan Path

### Skills

- Sync endpoint: `POST /api/v1/skills/sync`
- Query endpoints: `GET /api/v1/skills`, `GET /api/v1/skills/:skillId`
- Source pinned by `repo_url + commit_sha`
- Stored with ingestion provenance in Postgres
- Sync is idempotent by ingestion hash:
  - unchanged source returns `200` with `status: "unchanged"`
  - no spec rewrite in unchanged path (stable skill `updated_at`)

### Plans

- Draft endpoint: `POST /api/v1/plans/draft`
- Read endpoint: `GET /api/v1/plans/:planId`
- Approve endpoint: `POST /api/v1/plans/:planId/approve`

Plan draft pipeline:

- load selected skill
- run one policy-bounded LLM planner call
- strict JSON parse
- validate against static tool registry + skill allowlist + WP manifest
- compute deterministic estimate/risk/hash server-side
- persist plan + plan events

## M3 Boundaries

- No execute pipeline yet (M4 scope)
- Approve is state transition only
- Tool registry safety metadata is backend-authoritative

## M4 Execute Path

Execution now starts explicitly from UI after plan approval:

1. UI calls `POST /wp-json/wp-agent-admin/v1/runs`.
2. WP proxy forwards to backend `POST /api/v1/runs` with bootstrap header and scoped identity.
3. Backend validates approved plan + skill caps + runtime caps and creates a run record.
4. Backend executor invokes WP write tools:
   - single page: `content.create_page`
   - multi page: `content.bulk_create` then poll `jobs.get_status`
5. WP persists audit entries and rollback handles for created drafts.
6. Backend persists run events/steps/rollbacks and exposes them via `GET /api/v1/runs/:runId`.
7. Optional operator rollback calls `POST /api/v1/runs/:runId/rollback` -> WP `rollback.apply`.

## M4 Data Path Additions

- Backend Postgres:
  - `runs`
  - `run_steps`
  - `run_events`
  - `run_rollbacks`
- WP MySQL:
  - `wp_agent_jobs`
  - `wp_agent_audit_log`
  - `wp_agent_rollback_handles`
