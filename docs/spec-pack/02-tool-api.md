# Tool API Spec (M2)

## WordPress Tool API Surface

- Namespace: `wp-agent/v1`
- Manifest endpoint: `GET /wp-json/wp-agent/v1/manifest`
- Read-only tools:
  - `GET /wp-json/wp-agent/v1/site/environment` (`site.get_environment`)
  - `GET /wp-json/wp-agent/v1/content/inventory` (`content.inventory`)
  - `GET /wp-json/wp-agent/v1/seo/config` (`seo.get_config`)
- Admin pairing endpoint: `POST /wp-json/wp-agent-admin/v1/pair`

## Admin Proxy API Surface

- Namespace: `wp-agent-admin/v1`
- Connect status: `GET /wp-json/wp-agent-admin/v1/connect/status`
- Chat session create/resume: `POST /wp-json/wp-agent-admin/v1/chat/sessions`
- Chat current session: `GET /wp-json/wp-agent-admin/v1/chat/sessions/current`
- Chat message send: `POST /wp-json/wp-agent-admin/v1/chat/sessions/{session_id}/messages`

## Tool Endpoint Auth Rules

`/wp-agent/v1/*` tool endpoints allow either:

1. Authenticated WP admin (`manage_options`), or
2. Valid signed backend request with required signature headers.

Admin proxy endpoints under `wp-agent-admin/v1` require:

- Authenticated WP admin (`manage_options`), and
- Valid WordPress REST nonce (`X-WP-Nonce` / `wp_rest`).

## Manifest Contract

`GET /wp-json/wp-agent/v1/manifest` returns tools with:

- `name`
- `description`
- `endpoint`
- `method`
- `readOnly`
- `inputSchema` (optional)
- `outputSchema` (optional)

M2 required read tools in manifest:

- `site.get_environment`
- `content.inventory`
- `seo.get_config`

## Read Tool Contracts

### `site.get_environment`

Returns normalized runtime/site metadata:

- `site_url`, `home_url`
- `wp_version`, `php_version`
- `locale`, `timezone`
- `active_theme` info
- `permalink_structure`
- `is_multisite`

### `content.inventory`

Query params:

- `post_types` CSV (default: `post,page`)
- `statuses` CSV (default: `publish,draft,pending,private`)
- `page` (default: `1`)
- `per_page` (default: `20`, max `100`)

Returns:

- `summary.counts_by_type_status`
- `summary.total_items`
- paginated `items[]`
- `pagination` metadata

### `seo.get_config`

Returns normalized provider config:

- `provider`: `yoast|rankmath|none`
- `enabled`
- core flags (`xml_sitemaps_enabled`, `breadcrumbs_enabled`, `open_graph_enabled`)

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

## Implementation Files

WordPress:

- `apps/wp-plugin/includes/rest/routes.php`
- `apps/wp-plugin/includes/rest/tools/manifest.php`
- `apps/wp-plugin/includes/rest/tools/site.php`
- `apps/wp-plugin/includes/rest/tools/content.php`
- `apps/wp-plugin/includes/rest/tools/seo.php`
- `apps/wp-plugin/includes/rest/admin/pair.php`
- `apps/wp-plugin/includes/rest/admin/connect.php`
- `apps/wp-plugin/includes/rest/admin/chat.php`
- `apps/wp-plugin/includes/rest/auth/signatures.php`
- `apps/wp-plugin/includes/rest/auth/nonces.php`
- `apps/wp-plugin/includes/rest/auth/idempotency.php`
- `apps/wp-plugin/includes/rest/auth/rate_limit.php`

Backend:

- `apps/backend/src/services/wp/tool.manifest.ts`
- `apps/backend/src/services/wp/wp.client.ts`
- `apps/backend/src/routes/sessions.ts`
