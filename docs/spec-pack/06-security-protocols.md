# Security Protocols (M4)

## SP-1 Trust Boundaries

- WP generates and stores its own installation keypair.
- Backend stores WP public key from pairing payload.
- Backend signs outbound tool/manifest requests.
- WP verifies backend signatures using backend public key pinned from pairing response.
- WP also verifies request audience (`X-WP-Agent-Audience`) against pinned backend audience.
- WP does not sign tool execution requests in M1.

## SP-2 Pairing

### Request

`POST /api/v1/installations/pair`

Header:

- `X-WP-Agent-Bootstrap`

Body:

- `installation_id`
- `site_url`
- `public_key`
- `signature_alg` (`ed25519`)
- `plugin_version`

### Behavior

- Backend rejects invalid bootstrap auth with `401`.
- Backend applies pairing rate limits.
- Backend upserts installation by `installation_id`.
- If public key changes for same installation_id, update is allowed and audited as `KEY_ROTATED_UNVERIFIED`.

### Response

- Returns backend signing verifier and metadata for WP pinning:
  - `backend_public_key`
  - `backend_audience`
  - `backend_base_url`
  - `meta.audit_code`

## SP-3 Signed Request Canonicalization

Signed headers:

- `X-WP-Agent-Installation`
- `X-WP-Agent-Timestamp`
- `X-WP-Agent-TTL`
- `X-WP-Agent-ToolCallId`
- `X-WP-Agent-Audience`
- `X-WP-Agent-Signature`
- `X-WP-Agent-SignatureAlg`

Canonical string format:

```
installation_id + "\n" +
tool_call_id + "\n" +
timestamp + "\n" +
ttl + "\n" +
http_method + "\n" +
host + "\n" +
audience + "\n" +
canonical_path + "\n" +
canonical_query + "\n" +
sha256(canonical_json(body))
```

### Canonical query

- Parse query parameters
- Percent-decode input
- Sort by key, then value
- Percent-encode and join with `&`

### Canonical JSON

- UTF-8 JSON
- Recursive key sorting for objects
- No insignificant whitespace
- Stable scalar encoding
- Avoid float-dependent payloads in M1 signed bodies

## SP-4 Verification Rules in WP

WP rejects signed requests when:

- Any required signature header is missing.
- Algorithm is not `ed25519`.
- Installation ID does not match local installation.
- Audience does not match pinned backend audience.
- Timestamp is too far in the future (`> 300s` default skew).
- Request age exceeds TTL.
- Signature verification fails.
- Idempotency replay is detected (`409`).
- Rate limit is exceeded (`429`).

## SP-5 Storage

### Backend (Postgres)

- `installations`
- `pairing_audit`

### WordPress (MySQL)

- `wp_agent_idempotency`
- `wp_agent_rate_limit`
- options:
  - `wp_agent_installation_id`
  - `wp_agent_public_key`
  - `wp_agent_private_key_encrypted`
  - `wp_agent_backend_public_key`
  - `wp_agent_backend_audience`
  - `wp_agent_backend_base_url`
  - `wp_agent_signature_alg`
  - `wp_agent_paired_at`

## SP-6 Operational Notes

- Idempotency retention target: 24 hours.
- Replay semantics in M1: explicit `409` (no cached-result replay yet).
- Pairing attempts and key changes are auditable.
- Pair endpoint response metadata is propagated to admin-facing WP response messages so operators can distinguish no-op re-pairs from key-change updates.

## SP-7 M2 Chat/Proxy Controls

- Browser requests to `wp-agent-admin/v1/*` require:
  - authenticated admin capability (`manage_options`)
  - valid WordPress REST nonce (`X-WP-Nonce`)
- WP admin proxy calls backend session/chat endpoints using:
  - `X-WP-Agent-Bootstrap`
  - installation_id from local WP installation identity
  - wp_user_id from authenticated WP user
- Backend validates:
  - bootstrap header
  - installation pairing state
  - session scope ownership `(installation_id, wp_user_id)`
  - policy limits (rate + daily budget + input size)

## SP-8 M4 Execute Controls

- Execute endpoints (`/api/v1/runs*`) require bootstrap auth and installation/user scope checks.
- Runs can start only from approved plans and are protected by one-active-run lock per installation.
- Write tool calls continue to use signed-request verification and idempotency checks.
- WP write operations persist audit records with run/step/tool context.
- WP stores rollback handles for each created draft and exposes explicit rollback application endpoint.

## SP-9 Draft-Only Write Enforcement

- `content.create_page` and `content.bulk_create` force:
  - `post_type=page`
  - `post_status=draft`
- Client-provided status/publish intent is ignored in M4.
- Publish-class writes are out of scope until a later milestone.
