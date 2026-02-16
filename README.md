# WP Agent Runtime

WordPress plugin + backend orchestrator for policy-controlled agent execution.

## MVP Changelog

- 2026-02-16 — M0
  - Implemented backend `GET /api/v1/health`.
  - Added WP plugin bootstrap and admin-only `GET /wp-json/wp-agent/v1/manifest`.
  - Added local docker stack with WordPress+MariaDB and backend+Postgres+Redis.
  - Added baseline CI jobs for backend build and PHP lint.
  - Clarified AGENTS milestone update workflow and Tool API endpoint rule scope.
