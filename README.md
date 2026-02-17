# WP Agent

## AI Automation Layer for Professional WordPress Sites

WP Agent is a commercial AI automation platform built by **SYNQ +
Studio** for agencies, consultants, and growth-focused businesses
running WordPress.

It transforms your WordPress site into a structured AI-powered execution
environment --- without sacrificing control, performance, or cost
predictability.

---

## What WP Agent Does

WP Agent connects your WordPress site to a secure orchestration backend
that can:

- Generate and optimize structured content at scale
- Execute programmatic SEO workflows
- Audit and improve on-page performance
- Automate repetitive marketing tasks
- Connect to third-party tools via secure OAuth
- Enforce strict usage and cost controls

Unlike generic AI plugins, WP Agent operates under a deterministic
execution model designed for production use.

---

## Who It's For

WP Agent is designed for:

- WordPress agencies
- Growth marketers
- Technical founders
- SEO consultants
- Businesses managing multiple sites

If your WordPress site is part of a revenue engine, WP Agent is built
for you.

---

## How It Works

### 1. WordPress Plugin

Installed like a standard plugin, WP Agent provides:

- Skill selection interface
- Execution previews
- Controlled content generation
- Connector management
- Usage visibility

### 2. Hosted Orchestrator

Behind the scenes, a secure backend:

- Converts intent into structured execution plans
- Validates cost and policy limits
- Executes AI-driven workflows
- Logs and audits every action

No direct exposure of AI keys inside WordPress.

---

## Built for Control

WP Agent enforces:

- Token ceilings per execution
- Daily usage quotas
- Skill-level permissions
- Structured execution plans
- Preview-before-write safeguards

This prevents runaway API costs and unsafe automation.

---

## Commercial Platform

WP Agent is a proprietary product by SYNQ + Studio.

It is not open source and is intended for commercial deployment across
professional WordPress environments.

For partnership or early access inquiries, contact SYNQ + Studio
directly.

⸻

## MVP Changelog

- 2026-02-16 — M0
  - Implemented backend `GET /api/v1/health`.
  - Added WP plugin bootstrap and admin-only `GET /wp-json/wp-agent/v1/manifest`.
  - Added local docker stack with WordPress+MariaDB and backend+Postgres+Redis.
  - Added baseline CI jobs for backend build and PHP lint.
  - Clarified AGENTS milestone update workflow and Tool API endpoint rule scope.

- 2026-02-16 — M1
  - Added WP admin pairing trigger `POST /wp-json/wp-agent-admin/v1/pair` and backend pairing endpoint `POST /api/v1/installations/pair`.
  - Added backend installation persistence (`installations`, `pairing_audit`) and key-rotation audit semantics.
  - Added Ed25519 request signing/verification with canonical method+host+path+query+body-hash binding.
  - Added WP idempotency and per-installation rate-limit enforcement for signed requests.
  - Updated security specs and local env/docker configuration for pairing and signing.

- 2026-02-16 — M2
  - Added WP read-only tools `site.get_environment`, `content.inventory`, and `seo.get_config` plus typed manifest entries.
  - Added backend sessions/chat APIs with policy preset routing, bootstrap auth, and per-session cached WP context snapshots.
  - Added WP admin REST proxy endpoints (`connect/status`, `chat/sessions`, `chat/sessions/current`, `chat/sessions/{id}/messages`).
  - Added React admin Connect + Chat pages with policy selector and persisted session message flow.
  - Added backend unit/e2e tests for manifest validation, policy enforcement, usage ledger, and sessions/chat behavior.

- 2026-02-17 — M3
  - Added backend skills registry APIs (`/api/v1/skills/sync`, `/api/v1/skills`, `/api/v1/skills/:skillId`) with pinned-commit ingestion, normalization, allowlist validation, and provenance persistence.
  - Added backend plan-phase APIs (`/api/v1/plans/draft`, `/api/v1/plans/:planId`, `/api/v1/plans/:planId/approve`) with policy-enforced planner call, strict JSON parsing, deterministic validation/estimate/risk/hash, and status/event persistence.
  - Added Postgres migration `003_m3_skills_plans.sql` for `skill_ingestions`, `skill_specs`, `plans`, and `plan_events`.
  - Added WP admin proxy endpoints for skills/plans and new React admin Skills page with skill explorer, plan preview, and approve action.
  - Added M3 backend unit/e2e tests for skill normalization, plan parsing/validation/estimation, skills sync, plan draft, and plan approve behavior.

- 2026-02-17 — M4
  - Added WP draft-write tools `content.create_page`, `content.bulk_create`, plus `jobs.get_status` and `rollback.apply`, with manifest contracts and route registration.
  - Added WP persistence and async execution plumbing for jobs/audit/rollback handles (`wp_agent_jobs`, `wp_agent_audit_log`, `wp_agent_rollback_handles`) with Action Scheduler + WP-Cron fallback.
  - Added backend execute APIs (`POST /api/v1/runs`, `GET /api/v1/runs/:runId`, `POST /api/v1/runs/:runId/rollback`) and Postgres migration `004_m4_execute_runs.sql` (`runs`, `run_steps`, `run_events`, `run_rollbacks`).
  - Added run execution state machine, per-installation active-run lock, runtime cap enforcement, bulk-job polling, and explicit rollback path.
  - Added WP admin run proxy endpoints and Skills UI execute timeline/rollback UX, with backend tests including `run-pseo.smoke.test.ts` covering 10-draft creation flow.

- 2026-02-17 — Runtime LLM Routing Update
  - Replaced provider-specific backend client calls with Vercel AI SDK routed through Vercel AI Gateway.
  - Added task-class model selector with `cheap|balanced|quality` preference resolution and runtime fallback candidates.
  - Updated backend chat/planning call sites to use provider-agnostic `provider/model` IDs and model-selection debug logs.
  - Updated backend env/config and tests to use `AI_GATEWAY_API_KEY` and `AI_GATEWAY_BASE_URL`.

- 2026-02-17 — Request ID + Plan Metadata Integrity
  - Added end-to-end request tracing on backend API responses via `x-request-id` and JSON envelope `meta.request_id`.
  - Added deterministic model-routing observability with `routingReason` and per-call LLM request IDs in logs.
  - Added idempotent skills sync no-op behavior (`status: "unchanged"`) when ingestion hash is unchanged, preserving skill timestamps.
  - Standardized plan API metadata to `plan.llm.*` (selected model, task class, preference, request IDs) and removed `llm_model` from API responses.

- 2026-02-17 — Run Recovery on Restart
  - Added backend startup reconciliation for stale active runs (`queued`, `running`, `rolling_back`) using `RUN_RECOVERY_STALE_MINUTES` (default `15`).
  - Stale runs are now marked `failed` with `RUN_EXECUTION_ABORTED` and emit `run_recovered_after_restart` audit events.
  - Added recovery unit tests covering stale-run failure and fresh-run no-op behavior.

- 2026-02-17 — Run Worker Queueing
  - Refactored `POST /api/v1/runs` to enqueue only and return `run_id` without inline execution in the request lifecycle.
  - Added an in-process run worker loop that polls queued runs and claims them via DB lease (`FOR UPDATE SKIP LOCKED`) before execution.
  - Added `RUN_WORKER_POLL_INTERVAL_MS` config and worker unit coverage for queued-run lease/execute flow.

- 2026-02-17 — Auth + Heavy-Op Guardrails
  - Centralized backend bootstrap authentication into a shared pre-handler used by plans/runs/sessions/skills routes, with attached caller scope parsing (`installation_id`, `wp_user_id`).
  - Added synchronous guardrails for heavy endpoints: skills sync timeout/document cap and plans draft LLM/manifest/output caps.
  - Added stage timing metadata (`meta.progress`, `meta.elapsed_ms`) for `POST /api/v1/skills/sync` and `POST /api/v1/plans/draft`.
