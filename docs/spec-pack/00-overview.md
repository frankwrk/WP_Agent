# WP Agent Runtime - Overview

## Milestone M0 Scope

M0 established a runnable baseline with two integration surfaces:

- Backend API health endpoint at `GET /api/v1/health`.
- WordPress plugin bootstrap plus manifest endpoint at `GET /wp-json/wp-agent/v1/manifest`.
- Local Docker stack for WordPress, backend, database, and Redis.
- CI baseline with backend TypeScript build and PHP lint checks.

## Milestone M1 Scope

M1 adds pairing and server-to-server security plumbing:

- WP generates and persists installation identity + Ed25519 keypair (private key encrypted in WP options).
- Admin-only WP pairing trigger at `POST /wp-json/wp-agent-admin/v1/pair`.
- Backend pairing endpoint at `POST /api/v1/installations/pair` with bootstrap secret validation.
- Backend stores pairing state in Postgres (`installations`, `pairing_audit`).
- Backend signs WP requests with canonical request target binding (method + host + path + query + body hash).
- WP verifies signature, enforces timestamp TTL/skew rules, idempotency, and per-installation rate limiting.

## Milestone M2 Scope

M2 adds read-only agent runtime and chat with policy:

- WP read-only tools:
  - `site.get_environment`
  - `content.inventory`
  - `seo.get_config`
- Manifest includes typed tool contracts for required read tools.
- Backend sessions/chat endpoints with policy presets and bootstrap auth.
- Backend loads tool manifest and takes one context snapshot per chat session.
- WP admin REST proxy endpoints for connect/chat UX.
- React admin pages for Connect + Chat in WordPress admin.

## Data Stores in Local Dev

- WordPress runtime uses MariaDB/MySQL (`wp-db` service).
- Backend orchestrator uses PostgreSQL (`backend-db` service).
- Redis is available for backend runtime features.

## Milestone M3 Scope

M3 added skills ingestion and plan drafting/approval:

- Pinned-commit skills sync (`/api/v1/skills/sync`) with provenance persistence.
- Skills catalog/query endpoints (`/api/v1/skills`, `/api/v1/skills/:skillId`).
- Plan draft/validate APIs (`/api/v1/plans/draft`, `/api/v1/plans/:planId`).
- Plan approval API (`/api/v1/plans/:planId/approve`) with status-transition semantics only.
- Skills + Plan preview UI in WP admin.

## Milestone M4 Scope

M4 adds execute-phase runtime (pSEO v1, draft-only writes):

- New WP write tools:
  - `content.create_page`
  - `content.bulk_create`
  - `jobs.get_status`
  - `rollback.apply`
- Async job plumbing in WP with Action Scheduler + WP-Cron fallback.
- Write-tool audit log and persisted rollback handles in WP tables.
- Backend run lifecycle APIs:
  - `POST /api/v1/runs`
  - `GET /api/v1/runs/:runId`
  - `POST /api/v1/runs/:runId/rollback`
- Run state machine and one-active-run-per-installation lock.
- Skills page Execute + run timeline + explicit rollback action.

## Acceptance Highlights (M4)

- Session creation requires bootstrap auth and paired installation.
- Session creation validates required read tools from WP manifest.
- Chat requests are scoped to `(installation_id, wp_user_id)` and blocked on scope mismatch.
- Policy enforcement blocks oversized input, rate-limit overages, and daily token budget overages.
- Chat context is loaded once per session and reused for subsequent messages.
- Run creation requires approved plan scope and rejects active-run conflicts.
- pSEO smoke path supports async bulk draft creation and run completion tracking.
- Failed/completed runs can be explicitly rolled back via rollback handles (no auto-rollback).
