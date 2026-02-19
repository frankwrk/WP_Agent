# Progress Log (Public)

## 2026-02-18

- Step 1 complete: Supabase TLS CA verification in production.
  Evidence: production connections rely on CA verification via `SUPABASE_SSL_ROOT_CERT_PATH=<SUPABASE_SSL_ROOT_CERT_PATH>`; `sslmode=no-verify` is not used; deploy-time migration `EACCES` was resolved by deployment group-permission correction.
- Step 2 complete: pairing + bootstrap auth end-to-end.
  Evidence: `POST https://api.synqengine.com/api/v1/installations/pair` returns `401` when bootstrap auth is missing; pairing succeeds with valid bootstrap auth and persists `installation_id`.
- Step 3 complete: skills sync from pinned repo.
  Evidence: `POST https://api.synqengine.com/api/v1/skills/sync` with repo `https://github.com/frankwrk/marketingskills.git` at commit `58d5ca2fcb971645f9b6b5821416cb68b4770588` returned `skill_count=1`, `status=succeeded`; repeating the same sync returned unchanged status (idempotent); `GET https://api.synqengine.com/api/v1/skills?installation_id=<INSTALLATION_ID>` returned Programmatic SEO skill.

## Verification Commands

```bash
export API_BASE="https://api.synqengine.com"
export BOOTSTRAP_SECRET="<PAIRING_BOOTSTRAP_SECRET>"
export INSTALLATION_ID="<INSTALLATION_ID>"
```

```bash
# Step 2 negative check: bootstrap auth required
curl -i -X POST "$API_BASE/api/v1/installations/pair" \
  -H "Content-Type: application/json" \
  -d '{"installation_id":"'"$INSTALLATION_ID"'","wp_public_key":"<WP_PUBLIC_KEY_PEM>","site_url":"<WP_SITE_URL>"}'
```

```bash
# Step 2 positive check: pairing succeeds with bootstrap auth
curl -i -X POST "$API_BASE/api/v1/installations/pair" \
  -H "Content-Type: application/json" \
  -H "X-WP-Agent-Bootstrap: $BOOTSTRAP_SECRET" \
  -d '{"installation_id":"'"$INSTALLATION_ID"'","wp_public_key":"<WP_PUBLIC_KEY_PEM>","site_url":"<WP_SITE_URL>"}'
```

```bash
# Step 3 sync pinned skills snapshot
curl -i -X POST "$API_BASE/api/v1/skills/sync" \
  -H "Content-Type: application/json" \
  -H "X-WP-Agent-Bootstrap: $BOOTSTRAP_SECRET" \
  -d '{"installation_id":"'"$INSTALLATION_ID"'","repo_url":"https://github.com/frankwrk/marketingskills.git","commit_sha":"58d5ca2fcb971645f9b6b5821416cb68b4770588"}'
```

```bash
# Step 3 query check: Programmatic SEO skill is present
curl -i "$API_BASE/api/v1/skills?installation_id=$INSTALLATION_ID" \
  -H "X-WP-Agent-Bootstrap: $BOOTSTRAP_SECRET"
```

## Known Constraints

- Skills ingestion expects `skills/**.json` files, not `SKILL.md`.
- Skill normalization requires `tool_allowlist` and `safety_class`.
- Tool registry is static in backend (`apps/backend/src/services/plans/tool.registry.ts`) with current known tool IDs:
  - `site.get_environment`
  - `content.inventory`
  - `seo.get_config`
  - `content.create_page`
  - `content.bulk_create`

## Next Steps

- Step 4 only: create a chat session and draft a plan using the paired installation and synced skill set.
