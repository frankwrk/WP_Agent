# Architecture Notes (M3)

## Admin UI Pages

React admin pages now include:

- `Connect` (pairing status + pair action)
- `Chat` (M2 read-only session chat)
- `Skills` (M3 skill explorer + plan preview + approve action)

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

## M3 Skills + Plan Path

### Skills

- Sync endpoint: `POST /api/v1/skills/sync`
- Query endpoints: `GET /api/v1/skills`, `GET /api/v1/skills/:skillId`
- Source pinned by `repo_url + commit_sha`
- Stored with ingestion provenance in Postgres

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
