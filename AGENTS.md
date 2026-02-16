# AGENTS.md — Development Protocol (STRICT)

This repo contains:

- A WordPress plugin that exposes a Tool API (`/wp-json/wp-agent/v1/*`) and a React admin UI.
- A hosted backend orchestrator that plans and supervises skill runs.

## Non-negotiable rules

1. NO new WP Tool API endpoints (under `/wp-json/wp-agent/v1/*`) without updating:
   - docs/spec-pack/02-tool-api.md (WP)
   - apps/backend/src/services/wp/tool.manifest.ts (backend)
   - apps/wp-plugin/includes/rest/tools/manifest.php (WP)
   - Note: backend-only endpoints (example: `/api/v1/health`) are exempt from this Tool API manifest rule.
2. NO write tools without:
   - capability checks (`manage_options` or equivalent)
   - signature verification for backend calls
   - idempotency via tool_call_id
   - audit log event
   - rollback handle (revision/snapshot)
3. All LLM calls must pass through backend policy enforcement:
   - budgets, rate limits, allowed models/providers, retries
4. All skill runs must use two-phase commit:
   - Plan phase (read-only tools + plan.md generation + estimate)
   - Execute phase (explicit approval + bounded tool calls)

## Milestone workflow

- Work in milestones M0..M4 described in ROADMAP.md.
- Each milestone produces:
  - code changes
  - updated spec docs (if needed)
  - tests for new behavior
  - a short CHANGELOG entry in README.md (MVP section)
- When a milestone item is completed, update ROADMAP.md checklist state in the same PR.
- Every milestone PR must append one README MVP changelog entry with date, milestone, and a short change summary.

## Implementation order (do not reorder)

M0: Skeleton + health checks + manifests
M1: Pairing + signed requests + idempotency
M2: Read-only tools + chat with context
M3: Skills registry + plan contract + plan validation + estimate
M4: Write tools (create/bulk draft) + jobs + rollback + pSEO smoke test

## Definition of Done per PR

- lint/format passes
- unit tests pass
- e2e smoke test passes (where applicable)
- docs updated
- no TODOs left in committed code
