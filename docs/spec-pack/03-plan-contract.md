## PlanContract v1 (Canonical Schema)

Required Top-Level Fields

``` 
ts
type PlanContractV1 = {
  plan_version: 1
  plan_id: string           // UUID
  plan_hash: string         // sha256 of canonical JSON
  goal: string
  assumptions: string[]
  inputs: Record<string, unknown>
  steps: PlanStep[]
  estimates: PlanEstimate   // computed, not LLM-provided
  risk: PlanRiskScore       // computed
  policy_context: {
    policy_id: string
    snapshot_id: string
  }
}
```
## Determinism Rules

Define:
	•	Stable step ordering
	•	Step IDs required (step_id)
	•	No freeform steps
	•	Canonical JSON serialization before hashing
	•	plan_hash computed after validation, not before

This ensures:
	•	identical input → identical plan_hash
	•	diffable plans
	•	replay detection later

## Plan Lifecycle

draft → validated → approved → (M4: executing → completed | failed)

## Validation & Gating Codes

PLAN_INVALID_TOOL
PLAN_TOOL_NOT_ALLOWED
PLAN_STEP_CAP_EXCEEDED
PLAN_PAGE_CAP_EXCEEDED
PLAN_COST_CAP_EXCEEDED
PLAN_SCHEMA_INVALID

## Estimation Contract

Reference estimate.ts.

Define:
	•	estimated_pages
	•	estimated_tool_calls (per tool)
	•	estimated_tokens_bucket
	•	estimated_cost_usd
	•	estimated_runtime_sec
	•	confidence_band

Important:
Estimates must be computed server-side only.

## Plan Risk Scoring

Define risk tiers:
LOW    (read-only)
MEDIUM (draft writes)
HIGH   (bulk writes)

And scoring factors:
	•	number_of_steps
	•	write_intensity
	•	tool_novelty
	•	cost_ratio_to_cap

Risk score must be stored in PlanContract.

## Backend Implementation

apps/backend/src/services/plans/
plan.contract.ts
plan.parse.ts
plan.validate.ts
estimate.ts

Shared Types

packages/shared/src/types/plan.ts
packages/shared/src/schemas/plan.schema.json

Tests
apps/backend/test/unit/plan.validate.test.ts

### **Enforcement Points**

- Validate:
  - Tool exists in manifest
  - Tool is allowed in skill allowlist
  - Step count ≤ policy caps
  - Page count ≤ skill caps
- Reject invalid plans before execution

See:
- 02-tool-api.md (Tool Registry v1)
- 04-skill-spec.md (Skill ↔ Tool binding)
- 05-abuse-prevention.md (Estimation + caps)