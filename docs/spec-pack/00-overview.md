# WP Agent Runtime - Overview

## Milestone M0 Scope

M0 establishes a runnable local baseline with two health-oriented integration surfaces:

- Backend API health endpoint at `GET /api/v1/health`.
- WordPress plugin bootstrap plus admin-only manifest endpoint at `GET /wp-json/wp-agent/v1/manifest`.
- Local Docker stack for WordPress, backend, database, and Redis.
- CI baseline with backend TypeScript build and PHP lint checks.

## Data Stores in Local Dev

M0 intentionally runs two separate databases to match production responsibilities:

- WordPress runtime uses MariaDB/MySQL (`wp-db` service).
- Backend orchestrator uses PostgreSQL (`backend-db` service).
- Redis is shared for cache/rate-limit primitives.

## Explicitly Out of Scope in M0

The following are intentionally deferred to M1 and later:

- Pairing flows.
- Request signatures and signature verification.
- Any non-manifest tool execution contracts.

## M0 Acceptance

- Backend returns HTTP 200 with `{ "ok": true, ... }` from `/api/v1/health`.
- WordPress route `/wp-json/wp-agent/v1/manifest` is registered by plugin bootstrap and restricted to admin users.
- `docker compose -f infra/docker/docker-compose.yml up` starts `wp`, `backend`, `wp-db`, `backend-db`, and `redis` services.
- CI runs a backend build and PHP syntax validation.
