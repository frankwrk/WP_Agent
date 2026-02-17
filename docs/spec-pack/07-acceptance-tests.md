# Acceptance Tests

## M2 Regression Coverage

- Pairing and signed request behavior (M1)
- Sessions/chat auth + scope + budget checks
- Session context snapshot reuse

## M3 Backend Unit

- `skill.normalize.test.ts`
  - SkillSpec normalization with provenance
  - invalid schema rejection
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
  - unknown tool rejection
  - commit pin requirement
- `plans.draft.test.ts`
  - draft persists plan + events
  - scoped plan retrieval
- `plans.approve.test.ts`
  - `validated -> approved` only
  - no second approve allowed

## M3 WP/UI Smoke

- WP admin proxy endpoints require capability + nonce
- Skills page loads catalog and filters
- Plan draft from selected skill renders steps/estimate/risk/issues
- Approve action updates status and event timeline
