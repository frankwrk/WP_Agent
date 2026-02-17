# Acceptance Tests

## M2 Regression Coverage

- Pairing and signed request behavior (M1)
- Sessions/chat auth + scope + budget checks
- Session context snapshot reuse

## M3 Backend Unit

- `skill.normalize.test.ts`
  - SkillSpec normalization with provenance
  - invalid schema rejection
- `model.select.test.ts`
  - deterministic `routingReason` output for identical inputs
- `ai-gateway.client.test.ts`
  - provider request-id extraction from AI SDK metadata/headers
- `skills.store.idempotency.test.ts`
  - unchanged sync path keeps skill count and `updatedAt` stable
- `plan.parse.test.ts`
  - strict single JSON block parsing
  - multi-block and prose rejection
- `plan.validate.test.ts`
  - schema/tool/allowlist validation
  - gating issue generation
- `estimate.test.ts`
  - deterministic estimate/risk
  - cost cap gating

## M3 Backend E2E

- `skills.sync.test.ts`
  - bootstrap auth enforcement
  - successful sync persistence
  - idempotent second sync returns `status: "unchanged"`
  - unknown tool rejection
  - commit pin requirement
- `plans.draft.test.ts`
  - draft persists plan + events
  - response includes `plan.llm.*` and omits `llm_model`
  - scoped plan retrieval
- sessions + plan endpoints return `x-request-id` and `meta.request_id`
- `plans.approve.test.ts`
  - `validated -> approved` only
  - no second approve allowed

## M3 WP/UI Smoke

- WP admin proxy endpoints require capability + nonce
- Skills page loads catalog and filters
- Plan draft from selected skill renders steps/estimate/risk/issues
- Approve action updates status and event timeline

## M4 Backend Unit

- `run.input.mapper.test.ts`
  - validates `inputs.pages[]` mapping
  - enforces page caps and deterministic error codes
- run state transition guards and rollback aggregation in run services

## M4 Backend E2E

- `runs.create.test.ts`
  - requires bootstrap auth and paired/scope validation
  - enforces one-active-run-per-installation lock
- `runs.rollback.test.ts`
  - rollback endpoint applies pending handles and updates run state/events
- `run-pseo.smoke.test.ts`
  - approved plan execute path creates 10 draft pages via bulk job flow

## M4 WP/UI Smoke

- Signed write-tool requests are accepted only with valid signature context
- `content.create_page` and `content.bulk_create` enforce draft-only output
- Jobs status endpoint reports progress and created/failure counts
- Skills page shows Execute for approved plan, polls run timeline, and supports explicit rollback
