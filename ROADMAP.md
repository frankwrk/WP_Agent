# ROADMAP.md (MVP)

## Production Integration Steps (Current)

- [x] Step 1 — Supabase TLS CA verification (maps to M1 security plumbing).
  Evidence: production DB TLS uses CA verification (`SUPABASE_SSL_ROOT_CERT_PATH`), `sslmode=no-verify` disallowed, deploy migration `EACCES` fixed via group-permission correction.
- [x] Step 2 — Pairing + bootstrap auth end-to-end (maps to M1).
  Evidence: missing bootstrap auth returns `401`; valid pairing succeeds and persists `installation_id`.
- [x] Step 3 — Skills sync from pinned repository (maps to M3).
  Evidence: `POST /api/v1/skills/sync` with `https://github.com/frankwrk/marketingskills.git` @ `58d5ca2fcb971645f9b6b5821416cb68b4770588` returned `skill_count=1`, `status=succeeded`, and repeated sync remained unchanged (idempotent).
- [ ] Step 4 — Create chat session + draft plan (maps to M2 + M3).
  Current milestone: Step 4.

## M0 — Skeleton

- [x] Backend: health route, config, logging
- [x] WP plugin: bootstrap, REST route registration, /manifest returns empty tool list
- [x] Docker compose: wp + db + backend
- [x] CI: basic build/lint

## M1 — Pairing + Security plumbing

- [x] WP: generate site identity + keypair; store private locally
- [x] Backend: /installations/pair stores public key
- [x] Backend→WP signed tool call support (verify in WP)
- [x] WP: idempotency store (tool_call_id)
- [x] WP: rate limiting primitives for Tool API
- [x] Docs: security protocols updated

## M2 — Read-only agent

- [x] WP tools: site.get_environment, content.inventory, seo.get_config
- [x] Backend: wp client + tool manifest loader
- [x] Backend: sessions + chat endpoint (policy enforced)
- [x] UI: Connect + Chat pages

## M3 — Skills + Plan phase

- [x] Backend: ingest marketingskills repo (pin commit hash + provenance)
  [x] Define SkillSpec canonical schema v1 + normalizer
  [x] SkillSpec store: versioning + tagging + indexing
  [x] Backend: tool registry v1 (schemas, safety class, cost weights)
  [x] Bind skills ↔ tools (allowlists) and validate at plan-time
  [x] Define PlanContract schema v1 (plan_id, plan_hash, steps, assumptions)
  [x] Implement PlanContract parser (strict, single-block) + validator (schema + policy)
  [x] Estimation engine v1 (pages, tool calls, tokens buckets, cost bands, runtime)
  [x] Plan risk scoring + gating rules (machine-readable failures)
  [x] Persist plans + plan_events (approved/draft/rejected)
  [x] UI: Skills explorer (filters + detail)
  [x] UI: Plan preview (steps, estimate, risk, approve action)
  [ ] (Optional) Plan diff view for regenerated plans

## M4 — Execute phase (pSEO v1)

- [x] WP write tools: content.create_page, content.bulk_create (draft-only)
- [x] Jobs: Action Scheduler / WP-Cron fallback
- [x] Rollback handles: revisions + delete support
- [x] Backend: execute run state machine + step caps
- [x] e2e: run pSEO smoke test creates 10 drafts

## Documentation workflow (public/private)

- Keep contributor workflow and milestone status in public docs.
- Keep runbook operations and security-surface internals in the private docs repo.
- When milestone docs are updated, keep public entries sanitized and reference public stubs where applicable.
- Do not include environment identifiers, secrets, or operational scripts in public milestone updates.
