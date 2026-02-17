import { createHash } from "node:crypto";
import type { PolicyPreset } from "../policy/policy.schema";
import type { PlanEstimate, PlanRiskScore } from "./estimate";
import type { PlanStepDraft, PlanValidationIssue } from "./plan.validate";

export type PlanStatus = "draft" | "validated" | "approved" | "rejected";

export interface PlanLlmContext {
  selectedModel: string;
  taskClass: "chat_fast" | "chat_balanced" | "chat_quality" | "planning" | "code" | "summarize" | "extract_json";
  preference: "cheap" | "balanced" | "quality";
  requestId: string;
  providerRequestId?: string;
}

export interface PlanContract {
  planVersion: 1;
  planId: string;
  planHash: string;
  skillId: string;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStepDraft[];
  estimates: PlanEstimate;
  risk: PlanRiskScore;
  validationIssues: PlanValidationIssue[];
  policyContext: {
    policyPreset: PolicyPreset;
    model: string;
    maxSteps: number;
    maxToolCalls: number;
    maxPages: number;
    maxCostUsd: number;
  };
  llm: PlanLlmContext;
  status: PlanStatus;
  llmUsageTokens: number;
  createdAt: string;
  updatedAt: string;
}

function stableSortObject(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => stableSortObject(item));
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const source = input as Record<string, unknown>;
  const sortedKeys = Object.keys(source).sort((a, b) => a.localeCompare(b));
  const result: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    result[key] = stableSortObject(source[key]);
  }

  return result;
}

function canonicalJsonString(input: unknown): string {
  return JSON.stringify(stableSortObject(input));
}

export function computePlanHash(input: {
  planVersion: 1;
  skillId: string;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStepDraft[];
  policyContext: PlanContract["policyContext"];
}): string {
  const canonical = canonicalJsonString(input);
  return createHash("sha256").update(canonical).digest("hex");
}

export function toApiPlan(contract: PlanContract): Record<string, unknown> {
  return {
    plan_version: contract.planVersion,
    plan_id: contract.planId,
    plan_hash: contract.planHash,
    skill_id: contract.skillId,
    goal: contract.goal,
    assumptions: contract.assumptions,
    inputs: contract.inputs,
    steps: contract.steps.map((step) => ({
      step_id: step.stepId,
      title: step.title,
      objective: step.objective,
      tools: step.tools,
      expected_output: step.expectedOutput,
      page_count_estimate: step.pageCountEstimate,
      tool_call_estimate: step.toolCallEstimate,
    })),
    estimates: {
      estimated_pages: contract.estimates.estimatedPages,
      estimated_tool_calls: contract.estimates.estimatedToolCalls,
      estimated_tokens_bucket: contract.estimates.estimatedTokensBucket,
      estimated_cost_usd_band: contract.estimates.estimatedCostUsdBand,
      estimated_runtime_sec: contract.estimates.estimatedRuntimeSec,
      confidence_band: contract.estimates.confidenceBand,
      estimated_cost_usd: contract.estimates.estimatedCostUsd,
    },
    risk: {
      tier: contract.risk.tier,
      score: contract.risk.score,
      factors: {
        number_of_steps: contract.risk.factors.numberOfSteps,
        write_intensity: contract.risk.factors.writeIntensity,
        tool_novelty: contract.risk.factors.toolNovelty,
        cost_ratio_to_cap: contract.risk.factors.costRatioToCap,
      },
    },
    validation_issues: contract.validationIssues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      step_id: issue.stepId,
    })),
    policy_context: {
      policy_preset: contract.policyContext.policyPreset,
      model: contract.policyContext.model,
      max_steps: contract.policyContext.maxSteps,
      max_tool_calls: contract.policyContext.maxToolCalls,
      max_pages: contract.policyContext.maxPages,
      max_cost_usd: contract.policyContext.maxCostUsd,
    },
    llm: {
      selected_model: contract.llm.selectedModel,
      task_class: contract.llm.taskClass,
      preference: contract.llm.preference,
      request_id: contract.llm.requestId,
      provider_request_id: contract.llm.providerRequestId,
    },
    status: contract.status,
    llm_usage_tokens: contract.llmUsageTokens,
    created_at: contract.createdAt,
    updated_at: contract.updatedAt,
  };
}
