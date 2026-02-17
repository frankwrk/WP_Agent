# ROADMAP.md (MVP)

## M0 — Skeleton

- [x] Backend: health route, config, logging
- [x] WP plugin: bootstrap, REST route registration, /manifest returns empty tool list
- [x] Docker compose: wp + db + backend
- [x] CI: basic build/lint

## M1 — Pairing + Security plumbing

- [x] WP: generate installation_id + keypair; store private locally
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

- [ ] Backend: ingest marketingskills repo (pin commit hash + provenance)
  [ ] Define SkillSpec canonical schema v1 + normalizer
  [ ] SkillSpec store: versioning + tagging + indexing
  [ ] Backend: tool registry v1 (schemas, safety class, cost weights)
  [ ] Bind skills ↔ tools (allowlists) and validate at plan-time
  [ ] Define PlanContract schema v1 (plan_id, plan_hash, steps, assumptions)
  [ ] Implement PlanContract parser (strict, single-block) + validator (schema + policy)
  [ ] Estimation engine v1 (pages, tool calls, tokens buckets, cost bands, runtime)
  [ ] Plan risk scoring + gating rules (machine-readable failures)
  [ ] Persist plans + plan_events (approved/draft/rejected)
  [ ] UI: Skills explorer (filters + detail)
  [ ] UI: Plan preview (steps, estimate, risk, approve action)
  [ ] (Optional) Plan diff view for regenerated plans

## M4 — Execute phase (pSEO v1)

- [ ] WP write tools: content.create_page, content.bulk_create (draft-only)
- [ ] Jobs: Action Scheduler / WP-Cron fallback
- [ ] Rollback handles: revisions + delete support
- [ ] Backend: execute run state machine + step caps
- [ ] e2e: run pSEO smoke test creates 10 drafts
