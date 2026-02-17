# Tool API Spec (M4)

## WordPress Tool API Surface

- Namespace: `wp-agent/v1`
- Manifest endpoint: `GET /wp-json/wp-agent/v1/manifest`

### Read tools

- `GET /wp-json/wp-agent/v1/site/environment` (`site.get_environment`)
- `GET /wp-json/wp-agent/v1/content/inventory` (`content.inventory`)
- `GET /wp-json/wp-agent/v1/seo/config` (`seo.get_config`)

### Write/execute tools (M4)

- `POST /wp-json/wp-agent/v1/content/create-page` (`content.create_page`)
- `POST /wp-json/wp-agent/v1/content/bulk-create` (`content.bulk_create`)
- `GET /wp-json/wp-agent/v1/jobs/{job_id}` (`jobs.get_status`)
- `POST /wp-json/wp-agent/v1/rollback/apply` (`rollback.apply`)

## Admin Proxy API Surface

- Namespace: `wp-agent-admin/v1`
- Pairing: `POST /wp-json/wp-agent-admin/v1/pair`
- Connect status: `GET /wp-json/wp-agent-admin/v1/connect/status`
- Chat:
  - `POST /wp-json/wp-agent-admin/v1/chat/sessions`
  - `GET /wp-json/wp-agent-admin/v1/chat/sessions/current`
  - `POST /wp-json/wp-agent-admin/v1/chat/sessions/{session_id}/messages`
- Skills/Plans (M3):
  - `POST /wp-json/wp-agent-admin/v1/skills/sync`
  - `GET /wp-json/wp-agent-admin/v1/skills`
  - `GET /wp-json/wp-agent-admin/v1/skills/{skill_id}`
  - `POST /wp-json/wp-agent-admin/v1/plans/draft`
  - `GET /wp-json/wp-agent-admin/v1/plans/{plan_id}`
  - `POST /wp-json/wp-agent-admin/v1/plans/{plan_id}/approve`
- Runs (M4):
  - `POST /wp-json/wp-agent-admin/v1/runs`
  - `GET /wp-json/wp-agent-admin/v1/runs/{run_id}`
  - `POST /wp-json/wp-agent-admin/v1/runs/{run_id}/rollback`

## Tool Endpoint Auth Rules

`/wp-agent/v1/*` tool endpoints allow either:

1. Authenticated WP admin (`manage_options`), or
2. Valid signed backend request with required signature headers.

For write tools (`content.create_page`, `content.bulk_create`, `rollback.apply`), runtime requires:

- valid signed request path for backend-triggered execution,
- idempotency key (`tool_call_id`),
- audit log write,
- rollback handle persistence.

Admin proxy endpoints under `wp-agent-admin/v1` require:

- authenticated WP admin (`manage_options`), and
- valid WordPress REST nonce (`X-WP-Nonce` / `wp_rest`).

## Manifest Contract

`GET /wp-json/wp-agent/v1/manifest` returns tools with:

- `name`
- `description`
- `endpoint`
- `method`
- `readOnly`
- `safetyClass` (`read|write_draft|write_publish`)
- `costWeight`
- `internalOnly` (optional)
- `inputSchema` (optional)
- `outputSchema` (optional)

M2 required read tools remain mandatory:

- `site.get_environment`
- `content.inventory`
- `seo.get_config`

M4 tool additions:

- `content.create_page` (`write_draft`)
- `content.bulk_create` (`write_draft`)
- `jobs.get_status` (`read`, `internalOnly=true`)
- `rollback.apply` (`write_draft`, `internalOnly=true`)

## M4 Tool Contracts

### `content.create_page`

Input:

- `run_id`
- `step_id`
- `title`
- optional `slug`, `content`, `excerpt`, `meta`

Behavior/output:

- Always creates `post_type=page`, `post_status=draft`.
- Returns created draft metadata + rollback handle.

### `content.bulk_create`

Input:

- `run_id`
- `step_id`
- `items[]` (same page payload shape as create-page)

Behavior/output:

- Enqueues async bulk job.
- Returns `job_id`, `status=queued`, accepted counts.

### `jobs.get_status`

Output includes:

- `job_id`, `status`
- `progress` (`total_items`, `processed_items`, `created_items`, `failed_items`)
- `rollback_handles[]`
- `errors[]`

### `rollback.apply`

Input:

- `run_id`
- optional `handle_ids[]`

Output:

- rollback summary (`total`, `applied`, `failed`)
- per-handle results

## Signed Request Contract (Backend -> WP)

Required headers:

- `X-WP-Agent-Installation`
- `X-WP-Agent-Timestamp`
- `X-WP-Agent-TTL`
- `X-WP-Agent-ToolCallId`
- `X-WP-Agent-Audience`
- `X-WP-Agent-Signature`
- `X-WP-Agent-SignatureAlg: ed25519`

Canonical string:

1. installation_id
2. tool_call_id
3. timestamp
4. ttl
5. http_method (uppercased)
6. host (lowercased host:port)
7. audience
8. canonical_path
9. canonical_query (sorted and percent-encoded)
10. sha256(canonical_json(body))

## Lockstep Implementation Files

WordPress:

- `apps/wp-plugin/includes/rest/routes.php`
- `apps/wp-plugin/includes/rest/tools/manifest.php`
- `apps/wp-plugin/includes/rest/tools/site.php`
- `apps/wp-plugin/includes/rest/tools/content.php`
- `apps/wp-plugin/includes/rest/tools/seo.php`
- `apps/wp-plugin/includes/rest/tools/jobs.php`
- `apps/wp-plugin/includes/rest/tools/rollback.php`

Backend:

- `apps/backend/src/services/wp/tool.manifest.ts`
- `apps/backend/src/services/wp/wp.client.ts`
- `apps/backend/src/services/plans/tool.registry.ts`
