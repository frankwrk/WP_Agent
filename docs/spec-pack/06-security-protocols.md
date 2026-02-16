# **Security Protocols**

## **SP-1 Auth modes**

### **Installation keypair signatures**

- Plugin generates Ed25519 keypair:
  - public_key uploaded to backend at pairing
  - private_key stored in WP (options table, encrypted if possible)
- Backend signs all tool calls to WP.
- WP verifies signatures using stored public_key.

## **SP-2 Canonical signed payload format**

**Headers**

- X-WP-Agent-Installation: <uuid>
- X-WP-Agent-Timestamp: <unix_seconds>
- X-WP-Agent-TTL: <seconds> (e.g., 180)
- X-WP-Agent-ToolCallId: <uuid>
- X-WP-Agent-Signature: <base64(signature)>
- X-WP-Agent-SignatureAlg: ed25519

**Body**

```json
{
  "run_id": "<uuid>",
  "tool": "wp.content.create_page",
  "args": { "...": "..." }
}
```

**Canonical string to sign**

- installation_id + "\n" + tool_call_id + "\n" + timestamp + "\n" + ttl + "\n" + SHA256(body_json_canonical)

**WP verification**

- Check TTL window: abs(now - timestamp) <= ttl
- Check idempotency: reject if tool_call_id already processed for installation
- Verify signature using public_key

## **SP-3 Idempotency store**

- WP stores (installation_id, tool_call_id) → ts for at least 24h
  - table or option+transient strategy
- Backend uses retries safely.

## **SP-4 Endpoint hardening**

- Strict JSON schema validation on args
- Capability checks (admin gating)
- Rate limiting per installation
- Audit log append-only on all write tools

## **SP-5 Key rotation & revocation**

- Backend can mark installation revoked.
- WP checks revocation status periodically (or receives push).
- Rotation:
  - plugin generates new keypair
  - backend updates public key
  - old key remains valid for short overlap window (optional)

---

# **Concrete Policy JSON Schema (backend authoritative)**

## **Policy**

(versioned)

```json
{
  "policy_version": "1.0",
  "policy_id": "pol_123",
  "installation_id": "inst_123",
  "name": "Balanced",
  "status": "active",
  "routing": {
    "mode": "openrouter",
    "allowed_models": [
      "openai/gpt-5.2-mini",
      "anthropic/claude-4-sonnet",
      "google/gemini-2.5-pro"
    ],
    "allowed_providers": ["OpenAI", "Anthropic", "Google", "Groq"],
    "fallback_chain": ["anthropic/claude-4-sonnet", "openai/gpt-5.2-mini"],
    "max_context_tokens": 128000,
    "max_output_tokens": 2000
  },
  "budgets": {
    "daily_cost_cap_usd": 10.0,
    "daily_tokens_cap": 2000000,
    "per_run_cost_cap_usd": 2.0,
    "per_run_total_tokens_cap": 300000,
    "max_llm_calls_per_run": 20,
    "max_tool_calls_per_run": 500,
    "max_parallel_runs": 2
  },
  "rate_limits": {
    "llm_calls_per_minute": 6,
    "tool_calls_per_minute": 60,
    "runs_per_hour": 6,
    "burst_multiplier": 2
  },
  "skill_controls": {
    "default_require_checkpoint_for_write": true,
    "skills": {
      "programmatic-seo": {
        "enabled": true,
        "tools_allowlist": [
          "wp.site.get_environment",
          "wp.content.inventory",
          "wp.seo.get_config",
          "wp.content.bulk_create",
          "wp.seo.set_meta",
          "wp.internal_links.add_related"
        ],
        "require_draft_first": true,
        "max_pages_per_run": 200,
        "max_pages_per_day": 500,
        "batch_size": 25,
        "require_checkpoint": true,
        "disallow_publish": true
      },
      "seo-audit": {
        "enabled": true,
        "tools_allowlist": [
          "wp.site.get_environment",
          "wp.content.inventory",
          "wp.seo.get_config"
        ],
        "require_checkpoint": false
      }
    }
  },
  "security": {
    "require_signed_tool_calls": true,
    "tool_call_ttl_seconds": 180,
    "idempotency_window_hours": 24,
    "allow_byok": false
  },
  "anomaly_detection": {
    "enabled": true,
    "token_spike_multiplier": 5,
    "cost_spike_multiplier": 5,
    "max_failed_tool_calls_per_run": 25,
    "auto_suspend_on_trigger": true,
    "cooldown_minutes": 60
  },
  "created_at": "2026-02-15T00:00:00Z",
  "updated_at": "2026-02-15T00:00:00Z"
}
```

### **Notes**

- routing.allowed_models should be your curated list; UI picks policy, not model.
- skill_controls.skills[*].tools_allowlist is enforced at plan validation _and_ at execution time.
- disallow_publish prevents direct publishing unless explicitly allowed.

# **Orchestrator Enforcement Pseudocode (backend)**

Below is enforcement logic that prevents runaway bills even if prompts are malicious.

```jsx
function handle_user_message(session_id, message):
  sess = load_session(session_id)
  inst = load_installation(sess.installation_id)
  policy = load_active_policy(inst.installation_id)

  assert policy.status == "active"
  assert inst.status == "paired"
  assert user_is_authenticated(sess.user_ref)

  rateLimitOrThrow(policy.rate_limits, key=("msg", inst.id, sess.user_ref))

  // Chat may call LLM, so enforce budgets early
  checkAndReserveBudget(policy, inst.id, sess.user_ref, estimated_cost=SMALL_CHAT_ESTIMATE)

  context = maybe_fetch_cached_context(inst.id, policy)  // environment/inventory summaries only
  prompt = build_chat_prompt(message, context, policy)
  model = select_model(policy.routing)

  llm_resp = call_llm_with_limits(model, prompt,
                                  max_output_tokens=policy.routing.max_output_tokens,
                                  max_context_tokens=policy.routing.max_context_tokens)

  record_usage(inst.id, sess.user_ref, llm_resp.usage)
  return llm_resp.content

function create_run(session_id, skill_id, inputs):
  sess = load_session(session_id)
  inst = load_installation(sess.installation_id)
  policy = load_active_policy(inst.id)

  assert skill_enabled(policy, skill_id)

  rateLimitOrThrow(policy.rate_limits, key=("run_create", inst.id, sess.user_ref))
  enforce_parallel_runs(policy, inst.id)

  run = new_run(inst.id, sess.id, skill_id, status="created", inputs=inputs)
  save(run)
  return run

function plan_run(run_id):
  run = load_run(run_id)
  inst = load_installation(run.installation_id)
  policy = load_active_policy(inst.id)

  skill_cfg = policy.skill_controls.skills[run.skill_id]
  assert skill_cfg.enabled == true

  // PLAN PHASE: read-only context + bounded LLM
  enforce_run_not_rate_limited(inst.id)

  // 1) Collect required context via WP tools (read-only)
  required = skill_required_context(run.skill_id)
  tool_manifest = fetch_wp_tool_manifest(inst.id)
  assert tools_exist(tool_manifest, required)

  context = {}
  for tool in required:
    rateLimitOrThrow(policy.rate_limits, key=("tool_read", inst.id))
    resp = call_wp_tool_signed(inst, tool, args={}, policy)
    context[tool] = summarize_and_compact(resp.data)  // never raw dumps
    record_tool_event(run.id, tool, resp.meta)

  // 2) Ask LLM to generate plan.md + estimates
  prompt = build_planning_prompt(run.skill_id, inputs=run.inputs,
                                 context=context,
                                 tool_manifest=tool_manifest,
                                 skill_cfg=skill_cfg,
                                 policy=policy)

  model = select_model(policy.routing)
  llm_resp = call_llm_with_limits(model, prompt,
                                  max_output_tokens=policy.routing.max_output_tokens,
                                  max_context_tokens=policy.routing.max_context_tokens)

  record_usage(inst.id, run.user_ref, llm_resp.usage)

  plan = parse_plan_md_or_throw(llm_resp.content)

  // 3) Validate plan against policy + skill allowlists + caps
  validate_plan(plan,
                tool_manifest=tool_manifest,
                tools_allowlist=skill_cfg.tools_allowlist,
                max_tool_calls=policy.budgets.max_tool_calls_per_run,
                skill_caps=skill_cfg,
                policy_caps=policy.budgets)

  // 4) Compute/validate estimate (pages, tools, cost)
  estimate = estimate_run_cost(plan, policy, skill_cfg, llm_resp.usage)
  if estimate.cost_usd > policy.budgets.per_run_cost_cap_usd:
    throw BudgetExceeded("Per-run cost cap")

  if estimate.pages > skill_cfg.max_pages_per_run:
    throw BudgetExceeded("Max pages per run")

  // 5) Save plan + mark planned
  run.plan = plan
  run.estimate = estimate
  run.status = "planned"
  save(run)
  return run

function execute_run(run_id, checkpoint_ack):
  run = load_run(run_id)
  inst = load_installation(run.installation_id)
  policy = load_active_policy(inst.id)
  skill_cfg = policy.skill_controls.skills[run.skill_id]

  assert run.status == "planned"
  if skill_cfg.require_checkpoint:
    assert checkpoint_ack == true

  // Enforce daily & per-run budgets before execution
  enforce_daily_budgets(policy, inst.id, run.user_ref)
  enforce_parallel_runs(policy, inst.id)

  // Reserve run budget upfront (soft reserve)
  reserve_budget_or_throw(policy, inst.id, run.user_ref, run.estimate)

  run.status = "running"
  save(run)

  tool_calls_used = 0
  llm_calls_used = 0

  for step in run.plan.steps:
    if step.type == "tool_call":
      tool_calls_used += 1
      if tool_calls_used > policy.budgets.max_tool_calls_per_run:
        fail_run(run, "Tool call cap exceeded")
        break

      assert tool_in_allowlist(step.tool, skill_cfg.tools_allowlist)

      // Rate-limit tool calls
      rateLimitOrThrow(policy.rate_limits, key=("tool_write", inst.id))

      resp = call_wp_tool_signed(inst, step.tool, step.args, policy)
      record_tool_result(run.id, step.tool, resp)

      if resp.ok == false:
        record_failure(run.id, resp.error)
        if too_many_failures(run, policy.anomaly_detection.max_failed_tool_calls_per_run):
          maybe_suspend_installation(inst.id, policy, reason="too many tool failures")
          fail_run(run, "Too many tool failures")
          break

    else if step.type == "checkpoint":
      // Shouldn't appear during execute (already acknowledged), but handle defensively
      pause_run(run, "Checkpoint required")
      break

    else if step.type == "validation":
      // Validations are local checks; do not call LLM here
      ok = run_validation(step)
      if !ok:
        fail_run(run, "Validation failed: " + step.check)
        break

    // Continuous budget enforcement after each step
    enforce_daily_budgets(policy, inst.id, run.user_ref)
    if run_cost_so_far(inst.id, run.user_ref) > policy.budgets.per_run_cost_cap_usd:
      fail_run(run, "Per-run cost exceeded mid-execution")
      break

  if run.status == "running":
    run.status = "completed"
    run.report = build_report(run)
    commit_reserved_budget(policy, inst.id, run.user_ref, actual=run.report.usage)
    save(run)
    return run

function select_model(routing):
  // Deterministic selection: choose cheapest/fastest within allowed models,
  // then fallback chain if provider/model unavailable.
  for model in routing.fallback_chain:
    if model in routing.allowed_models and provider_allowed(model, routing.allowed_providers):
      if model_is_healthy(model):
        return model
  throw NoModelAvailable()

function validate_plan(plan, tool_manifest, tools_allowlist, max_tool_calls, skill_caps, policy_caps):
  assert plan.meta.plan_version in ["1.0"]
  assert count(plan.steps where type=="tool_call") <= max_tool_calls

  pages = infer_pages_count(plan)
  if pages != null:
    assert pages <= skill_caps.max_pages_per_run

  for step in plan.steps:
    if step.type == "tool_call":
      assert tool_exists(tool_manifest, step.tool)
      assert step.tool in tools_allowlist
    if step.type == "tool_call" and is_publish_tool(step.tool):
      assert skill_caps.disallow_publish != true
```

### **Practical “build first” implementation notes**

- Implement **Policy enforcement** in a single module that every LLM/tool call must pass through (no side paths).
- Store usage in **append-only usage ledger**:
  - usage_events(installation_id, user_ref, ts, model, input_tokens, output_tokens, cost_usd, run_id)
- Use **soft reservations**:
  - reserve estimated run budget before execute; release/commit after completion.
- Add **default caps** even on free tier:
  - prevents surprise bills during early tests.

# **WordPress Signature Verification**

apps/wp-plugin/includes/rest/auth/signatures.php

# **Backend Signature Generation**

apps/backend/src/services/wp/signature.ts

# **Idempotency**

apps/wp-plugin/includes/rest/auth/idempotency.php

# **Rate Limiting**

Backend: apps/backend/src/services/policy/limiter.ts
WP: apps/wp-plugin/includes/rest/auth/rate_limit.php

## **MUST**

- All backend→WP calls signed
- TTL enforced
- tool_call_id unique
- Duplicate tool_call_id rejected
- Expired timestamp rejected
