# Plan Contract v1 (M4)

## Purpose

Plan generation is now a dedicated backend phase (`/api/v1/plans/*`) and remains execute-free in M3.
Approval is a status transition only.

## Canonical Shape

`PlanContractV1` is returned by `POST /api/v1/plans/draft` and `GET /api/v1/plans/:planId`.

Required fields:

- `plan_version` (`1`)
- `plan_id` (UUID)
- `plan_hash` (sha256 of canonical JSON)
- `skill_id`
- `goal`
- `assumptions[]`
- `inputs{}`
- `steps[]`
- `estimates{}` (server-computed)
- `risk{}` (server-computed)
- `validation_issues[]`
- `policy_context{ policy_preset, model, max_steps, max_tool_calls, max_pages, max_cost_usd }`
- `llm{ selected_model, task_class, preference, request_id, provider_request_id? }`
- `status` (`validated` or `rejected` at draft time; `approved` after approve endpoint)

Notes:

- `llm.selected_model` is the single model authority for plan metadata.
- `llm_model` is not returned in API responses.
- Legacy rows without `llm_context` are read with fallback mapping.

## Parse Rules (Strict)

Planner output must be exactly one JSON object:

- allowed: raw JSON object
- allowed: one fenced `json` block containing one JSON object
- rejected: multiple fenced blocks (`PLAN_PARSE_MULTIBLOCK`)
- rejected: prose/extra text (`PLAN_PARSE_NONJSON`)
- rejected: invalid object schema (`PLAN_SCHEMA_INVALID`)

## Validation and Gating Codes

- `PLAN_INVALID_TOOL`
- `PLAN_TOOL_NOT_ALLOWED`
- `PLAN_STEP_CAP_EXCEEDED`
- `PLAN_PAGE_CAP_EXCEEDED`
- `PLAN_COST_CAP_EXCEEDED`
- `PLAN_SCHEMA_INVALID`

Validation enforces:

- `step_id` required and unique
- skill/tool allowlist compatibility
- tool presence in static backend registry
- tool presence in installation WP manifest at plan time
- policy and per-skill caps

## Estimation and Risk

Estimate is deterministic and server-side only:

- `estimated_pages`
- `estimated_tool_calls` (per tool)
- `estimated_tokens_bucket`
- `estimated_cost_usd_band`
- `estimated_runtime_sec`
- `confidence_band`
- internal numeric `estimated_cost_usd` for gating

Risk tiers:

- `LOW` for read-only plans
- `MEDIUM` for draft-write plans
- `HIGH` for publish/bulk-write plans

## Lifecycle

- `draft` event appended on creation
- `validated` or `rejected` event appended after validation
- `approved` event appended by `POST /api/v1/plans/:planId/approve`

## M4 Execute Handoff

M4 keeps the plan contract unchanged but adds explicit execute semantics:

- `POST /api/v1/runs` accepts only `approved` plans.
- Plan execution input is sourced from `plan.inputs.pages[]`.
- Approve is still not auto-execute; UI/backend must call runs endpoint explicitly.
- Run-time caps are enforced as:
  - `min(policy caps, skill caps, env hard caps)`.
