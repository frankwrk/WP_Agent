export type PlanStatus = "draft" | "validated" | "approved" | "rejected";

export interface PlanStep {
  step_id: string;
  title: string;
  objective: string;
  tools: string[];
  expected_output: string;
  page_count_estimate: number;
  tool_call_estimate: number;
}

export interface PlanContract {
  plan_version: 1;
  plan_id: string;
  plan_hash: string;
  skill_id: string;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStep[];
  llm: {
    selected_model: string;
    task_class: "chat_fast" | "chat_balanced" | "chat_quality" | "planning" | "code" | "summarize" | "extract_json";
    preference: "cheap" | "balanced" | "quality";
    request_id: string;
    provider_request_id?: string;
  };
  status: PlanStatus;
  llm_usage_tokens: number;
  created_at: string;
  updated_at: string;
}
