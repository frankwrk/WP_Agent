# ROADMAP.md (MVP)

## M0 — Skeleton

- [x] Backend: health route, config, logging
- [x] WP plugin: bootstrap, REST route registration, /manifest returns empty tool list
- [x] Docker compose: wp + db + backend
- [x] CI: basic build/lint

## M1 — Pairing + Security plumbing

- [ ] WP: generate installation_id + keypair; store private locally
- [ ] Backend: /installations/pair stores public key
- [ ] Backend→WP signed tool call support (verify in WP)
- [ ] WP: idempotency store (tool_call_id)
- [ ] WP: rate limiting primitives for Tool API
- [ ] Docs: security protocols updated

## M2 — Read-only agent

- [ ] WP tools: site.get_environment, content.inventory, seo.get_config
- [ ] Backend: wp client + tool manifest loader
- [ ] Backend: sessions + chat endpoint (policy enforced)
- [ ] UI: Connect + Chat pages

## M3 — Skills + Plan phase

- [ ] Backend: ingest marketingskills repo (pin commit hash)
- [ ] SkillSpec normalization store
- [ ] PlanContract parse + validate
- [ ] Estimate: pages + tool calls + cost
- [ ] UI: Skills list + Plan preview

## M4 — Execute phase (pSEO v1)

- [ ] WP write tools: content.create_page, content.bulk_create (draft-only)
- [ ] Jobs: Action Scheduler / WP-Cron fallback
- [ ] Rollback handles: revisions + delete support
- [ ] Backend: execute run state machine + step caps
- [ ] e2e: run pSEO smoke test creates 10 drafts
