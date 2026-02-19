# Acceptance Tests (Public Stub)

## Purpose
This document provides a public-safe placeholder for acceptance-test coverage and execution details.

## Intentionally Omitted
Operational and security-sensitive test and environment details are removed from this public repository.

## Internal Access
Request access through SYNQ maintainers.

## Private Location
- `spec-pack/internal/07-acceptance-tests.md`

## Public Checkpoint Snapshot (2026-02-18)

- [x] Step 1: Supabase TLS CA verification complete.
  Evidence reference: production DB TLS uses `SUPABASE_SSL_ROOT_CERT_PATH`; `sslmode=no-verify` is rejected in production config; deploy migration `EACCES` resolved via group permissions.
- [x] Step 2: Pairing + bootstrap auth complete.
  Evidence reference: `POST https://api.synqengine.com/api/v1/installations/pair` returns `401` without bootstrap header; succeeds with valid bootstrap auth and persists `installation_id`.
- [x] Step 3: Pinned skills sync complete.
  Evidence reference: `POST https://api.synqengine.com/api/v1/skills/sync` with repo `https://github.com/frankwrk/marketingskills.git` and commit `58d5ca2fcb971645f9b6b5821416cb68b4770588` returned `status=succeeded`, `skill_count=1`; repeated sync remained unchanged (idempotent); `GET https://api.synqengine.com/api/v1/skills?installation_id=<INSTALLATION_ID>` returned Programmatic SEO skill.

- [ ] Step 4: Create chat session + draft plan (current milestone).
