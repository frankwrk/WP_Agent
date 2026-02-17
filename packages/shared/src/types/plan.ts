import type { PolicyPreset } from "./policy";

export type PlanStatus = "draft" | "validated" | "approved" | "rejected";

export interface PlanStepV1 {
  step_id: string;
  title: string;
  objective: string;
  tools: string[];
  expected_output: string;
  page_count_estimate?: number;
  tool_call_estimate?: number;
}

export interface PlanEstimateV1 {
  estimated_pages: number;
  estimated_tool_calls: Record<string, number>;
  estimated_tokens_bucket: "low" | "medium" | "high";
  estimated_cost_usd_band: "low" | "medium" | "high";
  estimated_runtime_sec: number;
  confidence_band: "low" | "medium" | "high";
}

export interface PlanRiskScoreV1 {
  tier: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  factors: {
    number_of_steps: number;
    write_intensity: number;
    tool_novelty: number;
    cost_ratio_to_cap: number;
  };
}

export interface PlanValidationIssue {
  code: string;
  message: string;
  step_id?: string;
}

export interface PlanPolicyContextV1 {
  policy_preset: PolicyPreset;
  model: string;
  max_steps: number;
  max_tool_calls: number;
  max_pages: number;
  max_cost_usd: number;
}

export interface PlanContractV1 {
  plan_version: 1;
  plan_id: string;
  plan_hash: string;
  skill_id: string;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStepV1[];
  estimates: PlanEstimateV1;
  risk: PlanRiskScoreV1;
  validation_issues: PlanValidationIssue[];
  policy_context: PlanPolicyContextV1;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
}

export interface PlanDraftRequestV1 {
  installation_id: string;
  wp_user_id: number;
  policy_preset: PolicyPreset;
  skill_id: string;
  goal: string;
  inputs: Record<string, unknown>;
}
