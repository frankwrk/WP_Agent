# **Abuse Prevention & Billing Controls**

## **AP-1 Goals**

- Prevent unauthorized use of billable inference.
- Bound worst-case spend per installation/account/run.
- Contain damage from compromised WP admin credentials.
- Make execution deterministic and auditable.

## **AP-2 Threat surfaces**

1. **Backend API endpoints** that can trigger LLM calls (chat, plan, execute).
2. **WP Tool API** endpoints (especially write tools).
3. **Installation pairing** (fraudulent onboarding / proxy abuse).
4. **Prompt injection** via WP content and user inputs.
5. **Runaway orchestration loops** (excess LLM/tool calls).
6. **Model routing misuse** (expensive models, large contexts, retries).
7. **Replay/forgery** on backend↔WP server-to-server calls.

## **AP-3 Mandatory controls (MUST)**

### **1) Hard caps (backend-enforced)**

- Per installation:
  - daily_cost_cap_usd
  - daily_tokens_cap
  - max_parallel_runs
- Per account/user:
  - daily_cost_cap_usd
  - daily_runs_cap
- Per run:
  - max_cost_usd
  - max_total_tokens
  - max_llm_calls
  - max_tool_calls
- Per skill:
  - max_pages_per_run
  - require_draft_first
  - tool allowlist

**Behavior**

- When cap reached → **hard stop**:
  - return error code BUDGET_EXCEEDED
  - set rate_limited_until (cooldown)
  - optionally set installation.suspended=true if anomalous

### **2) Two-phase commit (plan → execute)**

- **Plan phase**: read-only tools + a single bounded LLM call to output plan + estimate.
- **Execute phase**: requires explicit approval + executes with bounded batches and stop conditions.

### **3) Rate limiting (backend + WP)**

- Backend: token bucket in Redis (or equivalent) per:
  - IP address (signup/login/run creation)
  - account/user
  - installation
- WP: per-installation request throttles for tool execution endpoints (transients ok).

### **4) Signed server-to-server requests + idempotency**

- Every backend→WP tool call includes:
  - tool_call_id UUID
  - timestamp + TTL
  - signature over canonical payload
- WP rejects:
  - expired ts/TTL
  - duplicate tool_call_id
  - bad signature

### **5) Policy-driven model routing (no free-form model selection)**

- Plugin UI selects a **policy** (Fast/Balanced/Quality/Reasoning).
- Backend chooses model/provider from allowlist + fallback chain.

### **6) Prompt-injection containment**

- Treat WP content as untrusted.
- Always pass WP context as **structured summaries** (JSON), never raw HTML dumps by default.
- Enforce instruction hierarchy (policy > skill constraints > user > retrieved content).

### **7) Anomaly detection + kill switch**

- Detect spikes:
  - tokens/minute
  - run count/time
  - repeated tool failures
  - unusual IP/geolocation
- Automatic response:
  - suspend installation + notify
  - require manual re-enable

---

## **AP-4 “Cost estimation + dry run” requirements**

Before execute:

- backend must compute an **estimate**:
  - expected pages (if skill produces pages)
  - expected LLM calls
  - expected tool calls
  - estimated token usage range
  - estimated cost range
- if estimate exceeds any cap → block run at plan time.

---

## **AP-5 Per-skill guardrails (example: programmatic-seo)**

- default draft_only = true
- max_pages_per_run = 200
- batch_size = 25
- must include checkpoint: “Approve creating N drafts”
- optional: noindex_if_thin = true

## **Backend Enforcement (Authoritative)**

apps/backend/src/services/policy/
policy.schema.ts
policy.store.ts
enforcement.ts
limiter.ts
anomaly.ts

Usage Ledger

apps/backend/src/services/llm/usage.ledger.ts

## **Enforcement Points**

- Every LLM call
- Every tool call
- Every run start
- Before and after each execution step

## **MUST Enforced Limits**

- daily_cost_cap_usd
- per_run_cost_cap_usd
- max_llm_calls_per_run
- max_tool_calls_per_run
- max_parallel_runs
- per-skill page caps

## **Tests**

- Budget exceeded mid-run stops execution
- Daily cap suspends installation
- Anomaly trigger auto-suspends
