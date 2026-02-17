# Acceptance Tests

## M1 E2E (existing)

- Pair installation
- Signed request verification
- Idempotency and rate limit behavior

## M2 Backend E2E

- `POST /api/v1/sessions` rejects missing/invalid bootstrap header.
- `POST /api/v1/sessions` rejects unknown installation.
- Session creation fetches read-only WP context once and persists snapshot.
- `POST /api/v1/sessions/:id/messages` uses cached context and persists user+assistant messages.
- Daily token cap returns deterministic `BUDGET_EXCEEDED`.

## M2 WP/API checks

- Signed backend calls can access read-only tool endpoints.
- Admin-authenticated calls can access read-only tool endpoints.
- `content.inventory` defaults to `post,page` with summary + paginated sample data.
- `seo.get_config` normalizes provider output for `none`, Yoast, and Rank Math.

## M2 UI smoke checks

- Connect page renders status and triggers pairing.
- Chat page can select policy preset and load current session.
- Chat page can send messages and render assistant responses.
