export type PolicyPreset = "fast" | "balanced" | "quality" | "reasoning";

export interface AdminConfig {
  restBase: string;
  nonce: string;
  initialPage: "connect" | "chat" | "skills";
  siteUrl: string;
}

export interface ConnectStatus {
  installation_id: string;
  paired: boolean;
  paired_at: string;
  backend_base_url: string;
  backend_audience: string;
  signature_alg: string;
}

export interface ChatSession {
  session_id: string;
  installation_id: string;
  wp_user_id: number;
  policy_preset: PolicyPreset;
  context_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface ChatMessage {
  session_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  usage_tokens: number;
  created_at: string;
}

export interface SkillCatalogItem {
  skill_id: string;
  version: string;
  name: string;
  description: string;
  tags: string[];
  safety_class: "read" | "write_draft" | "write_publish";
  deprecated: boolean;
  source_repo: string;
  source_commit_sha: string;
  updated_at: string;
}

export interface SkillSpec {
  skill_id: string;
  version: string;
  source: {
    repo: string;
    commit_sha: string;
    path: string;
  };
  name: string;
  description: string;
  tags: string[];
  inputs_schema: Record<string, unknown>;
  outputs_schema: Record<string, unknown>;
  tool_allowlist: string[];
  caps: {
    max_pages?: number;
    max_tool_calls?: number;
    max_steps?: number;
    max_cost_usd?: number;
  };
  safety_class: "read" | "write_draft" | "write_publish";
  deprecated: boolean;
}

export interface PlanValidationIssue {
  code: string;
  message: string;
  step_id?: string;
}

export interface PlanStep {
  step_id: string;
  title: string;
  objective: string;
  tools: string[];
  expected_output: string;
  page_count_estimate: number;
  tool_call_estimate: number;
}

export interface PlanContractApi {
  plan_version: 1;
  plan_id: string;
  plan_hash: string;
  skill_id: string;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStep[];
  estimates: {
    estimated_pages: number;
    estimated_tool_calls: Record<string, number>;
    estimated_tokens_bucket: "low" | "medium" | "high";
    estimated_cost_usd_band: "low" | "medium" | "high";
    estimated_runtime_sec: number;
    confidence_band: "low" | "medium" | "high";
    estimated_cost_usd: number;
  };
  risk: {
    tier: "LOW" | "MEDIUM" | "HIGH";
    score: number;
    factors: {
      number_of_steps: number;
      write_intensity: number;
      tool_novelty: number;
      cost_ratio_to_cap: number;
    };
  };
  validation_issues: PlanValidationIssue[];
  policy_context: {
    policy_preset: PolicyPreset;
    model: string;
    max_steps: number;
    max_tool_calls: number;
    max_pages: number;
    max_cost_usd: number;
  };
  status: "draft" | "validated" | "approved" | "rejected";
  llm_usage_tokens: number;
  llm_model: string;
  created_at: string;
  updated_at: string;
}

export interface PlanEvent {
  id: string;
  plan_id: string;
  event_type: "draft" | "validated" | "approved" | "rejected";
  actor_type: "system" | "user";
  actor_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error: { code: string; message: string } | null;
  meta: unknown;
}

declare global {
  interface Window {
    WP_AGENT_ADMIN_CONFIG?: AdminConfig;
  }
}
