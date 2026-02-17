**AI Agent Runtime for WordPress — with Hosted Orchestrator + Skill Layer**

WP Agent is a hybrid **WordPress plugin + hosted SaaS backend** that brings structured AI agent runtimes into the WordPress environment.

It allows site owners and builders to:

- Execute structured agent “skills” mapped to WordPress workflows
- Automate marketing operations (pSEO, content, optimization, audits)
- Safely connect third-party tools via OAuth
- Enforce strict policy and cost controls
- Operate under a deterministic execution contract (plan-based orchestration)

The system is built for professional WordPress builders and agencies who want AI leverage without sacrificing control, security, or cost predictability.

---

# System Architecture Overview

```
WordPress (Client)
    └── WP Agent Plugin (PHP + React Admin UI)
            └── Authenticated API Requests
                    └── Hosted Orchestrator (Node / Edge API)
                            ├── Policy Engine
                            ├── Skill Registry
                            ├── Execution Planner
                            ├── Tool Connectors (OAuth)
                            ├── LLM Runtime
                            └── Usage & Cost Metering
```

---

# What This Project Is

WP Agent is:

- A structured agent runtime layer for WordPress
- A skill-mapped automation system
- A policy-controlled LLM orchestration engine
- A monetizable SaaS product
- A foundation for expansion into frontend, performance, and ops agents

WP Agent is **not**:

- A generic chatbot plugin
- An unrestricted LLM proxy
- A simple “generate content” tool
- A local-only automation system

It is designed as a **controlled execution environment**.

---

# Core Components

## 1. WordPress Plugin

### Responsibilities

- UI for agent configuration
- Skill selection and execution
- OAuth connector setup
- Site-level policy enforcement
- Secure API communication with backend
- Action preview + rollback hints
- Execution logs display

### Built With

- PHP (plugin bootstrap)
- React (admin UI)
- WordPress REST API
- Nonce-based authentication
- Signed API requests

---

## 2. Hosted Orchestrator (SaaS Backend)

### Responsibilities

- Plan generation
- Skill routing
- Tool execution
- LLM interaction
- Cost accounting
- Abuse detection
- Policy enforcement

### Subsystems

| Subsystem      | Function                                         |
| -------------- | ------------------------------------------------ |
| Planner        | Converts user intent → deterministic plan.md     |
| Policy Engine  | Validates token budgets, skills, domains, quotas |
| Skill Registry | Maps skill IDs → execution handlers              |
| Tool Gateway   | Handles external APIs + OAuth tokens             |
| Metering Layer | Tracks token + execution cost                    |
| Audit Logger   | Stores execution traces                          |

---

## 3. Skill Layer

Skills are atomic, declarative, and sandboxed.

Each skill includes:

```json
{
  "id": "wp.pseo.generate",
  "description": "Generate programmatic SEO pages",
  "inputs": ["keyword_set", "template"],
  "outputs": ["draft_pages"],
  "requires_tools": ["wordpress.write"],
  "token_estimate": 2500
}
```

Initial v1 skills map from:

- MarketingSkills repository
- WordPress content workflows
- SEO automation patterns

Future skill domains:

- Frontend design skills
- Performance optimization
- Technical SEO audits
- Commerce operations
- Analytics automation

---

## 4. Policy & Abuse Protection

Critical for bootstrap viability.

### Risk Areas

- Infinite LLM loops
- Malicious prompt injection
- Excessive token usage
- Automated content farms
- OAuth misuse
- External API flooding

### Mitigation Strategy

1. Hard token ceilings per execution
2. Skill-level cost estimation
3. Daily usage quotas
4. Deterministic plan contract
5. Signed execution envelopes
6. Domain-bound OAuth tokens
7. Rate limiting
8. Anomaly detection

### Example Policy JSON

```json
{
  "site_id": "abc123",
  "max_tokens_per_run": 8000,
  "max_runs_per_day": 25,
  "allowed_skills": [
    "wp.pseo.generate",
    "wp.content.audit",
    "wp.meta.optimize"
  ],
  "blocked_domains": [],
  "max_external_calls": 15
}
```

---

# Execution Flow

## Step 1: User Initiates Skill

User selects skill inside WordPress admin.

---

## Step 2: Plan Generation

The orchestrator generates a deterministic `plan.md`.

Example:

```md
# Plan: pSEO Generation

1. Fetch keyword set
2. Generate 10 page drafts
3. Validate internal linking
4. Prepare WordPress draft payload
```

The plan must be:

- Explicit
- Ordered
- Non-recursive
- Cost-estimated

---

## Step 3: Policy Validation

The policy engine checks:

- Token estimate
- Tool usage
- Site limits
- OAuth scope
- Skill permissions

If valid → execution proceeds  
If invalid → rejected with explanation

---

## Step 4: Skill Execution

Skills may:

- Call LLM
- Call WordPress REST
- Call third-party APIs
- Chain deterministic tool calls

All calls logged.

---

## Step 5: Result & Rollback

Plugin receives:

- Draft changes
- Proposed diffs
- Rollback metadata
- Token usage report

User confirms before permanent changes.

---

# Connectors (OAuth & API Keys)

WP Agent supports:

- Google Search Console
- GitHub
- OpenAI API key injection (optional BYOK)
- Analytics providers
- Email providers

### Connector Model

- OAuth tokens encrypted at rest
- Domain-scoped usage
- Rate limited
- Revocable
- Stored server-side (never in WP DB)

---

# Deterministic Plan Contract

All executions must follow `plan.md` contract.

### Rules

1. No dynamic tool discovery mid-run
2. No implicit recursion
3. No unbounded loops
4. All tools declared upfront
5. All estimated costs precomputed

This ensures:

- Predictability
- Auditability
- Billing control
- Safer automation

---

# Repository Structure

```
wp-agent/
├── wordpress-plugin/
│   ├── wp-agent.php
│   ├── includes/
│   ├── admin-ui/
│   └── assets/
│
├── orchestrator/
│   ├── src/
│   │   ├── planner/
│   │   ├── policy/
│   │   ├── skills/
│   │   ├── connectors/
│   │   └── metering/
│   │
│   ├── openapi.yaml
│   └── AGENTS.md
│
├── shared/
│   ├── plan-contract.md
│   ├── policy-schema.json
│   └── skill-schema.json
│
└── README.md
```

---

# Monetization Model

Designed for:

- Agencies
- Power WordPress builders
- Marketing automation consultants

### Possible Tiers

| Tier        | Features                       |
| ----------- | ------------------------------ |
| Free        | Limited runs, basic skills     |
| Pro         | Expanded skills, higher limits |
| Agency      | Multi-site, priority execution |
| White Label | Custom branding + API access   |

---

# Security Model

- Signed JWT per execution
- Nonce validation
- Encrypted OAuth tokens
- Backend rate limiting
- Usage anomaly detection
- Full audit logs
- Zero LLM direct exposure from WordPress

---

# Why This Architecture

This hybrid model:

- Prevents runaway API bills
- Allows centralized skill upgrades
- Enables SaaS monetization
- Protects API keys
- Allows controlled agent evolution

It also supports longer-term expansion:

- Multi-agent runtime
- Design + frontend skills
- Performance automation
- Cross-site orchestration
- Enterprise control layers

---

# Roadmap (High-Level)

## v0

- 3–5 marketing skills
- Deterministic plan engine
- Policy enforcement
- Token metering
- WordPress write preview

## v1

- Connector marketplace
- Expanded skill registry
- Usage dashboard
- Team roles

## v2

- Agent workflows
- Multi-agent composition
- Frontend design automation
- Performance AI tools

---

# Commercial Notice

WP Agent is proprietary software owned and operated by SYNQ + Studio.

© SYNQ + Studio 2026. All rights reserved.

Unauthorized distribution, modification, or commercial reuse without explicit written permission is prohibited.

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
