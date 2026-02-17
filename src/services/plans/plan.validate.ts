import type { PolicyPreset } from "../policy/policy.schema";
import type { NormalizedSkillSpec } from "../skills/normalize";
import type { ToolRegistryEntry } from "./tool.registry";

export interface PlanStepDraft {
  stepId: string;
  title: string;
  objective: string;
  tools: string[];
  expectedOutput: string;
  pageCountEstimate: number;
  toolCallEstimate: number;
}

export interface ValidatedPlanDraft {
  planVersion: 1;
  skillId: string;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStepDraft[];
}

export interface PlanValidationIssue {
  code:
    | "PLAN_INVALID_TOOL"
    | "PLAN_TOOL_NOT_ALLOWED"
    | "PLAN_STEP_CAP_EXCEEDED"
    | "PLAN_PAGE_CAP_EXCEEDED"
    | "PLAN_COST_CAP_EXCEEDED"
    | "PLAN_SCHEMA_INVALID";
  message: string;
  stepId?: string;
}

export interface PlanPolicyContext {
  policyPreset: PolicyPreset;
  model: string;
  maxSteps: number;
  maxToolCalls: number;
  maxPages: number;
  maxCostUsd: number;
}

export interface ValidatePlanInput {
  parsed: Record<string, unknown>;
  skill: NormalizedSkillSpec;
  policy: PlanPolicyContext;
  toolRegistry: Record<string, ToolRegistryEntry>;
  manifestToolNames: Set<string>;
}

export interface ValidatePlanResult {
  plan: ValidatedPlanDraft | null;
  issues: PlanValidationIssue[];
}

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = value
    .map((item) => asString(item))
    .filter((item) => item.length > 0);

  return [...new Set(items)];
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export function validatePlanDraft(input: ValidatePlanInput): ValidatePlanResult {
  const issues: PlanValidationIssue[] = [];

  const planVersion = Number.parseInt(String(input.parsed.plan_version ?? ""), 10);
  if (planVersion !== 1) {
    issues.push({
      code: "PLAN_SCHEMA_INVALID",
      message: "plan_version must be 1",
    });
  }

  const skillId = asString(input.parsed.skill_id);
  if (!skillId || skillId !== input.skill.skillId) {
    issues.push({
      code: "PLAN_SCHEMA_INVALID",
      message: "skill_id must match requested skill",
    });
  }

  const goal = asString(input.parsed.goal);
  if (!goal) {
    issues.push({
      code: "PLAN_SCHEMA_INVALID",
      message: "goal is required",
    });
  }

  const assumptions = asStringArray(input.parsed.assumptions);
  const inputsRecord = asObject(input.parsed.inputs);
  if (!inputsRecord) {
    issues.push({
      code: "PLAN_SCHEMA_INVALID",
      message: "inputs must be an object",
    });
  }

  const rawSteps = Array.isArray(input.parsed.steps) ? input.parsed.steps : [];
  if (rawSteps.length === 0) {
    issues.push({
      code: "PLAN_SCHEMA_INVALID",
      message: "steps must be a non-empty array",
    });
  }

  const normalizedSteps: PlanStepDraft[] = [];
  let totalPages = 0;
  let totalToolCalls = 0;

  const allowlist = new Set(input.skill.toolAllowlist);

  for (const rawStep of rawSteps) {
    const step = asObject(rawStep);
    if (!step) {
      issues.push({
        code: "PLAN_SCHEMA_INVALID",
        message: "Each step must be an object",
      });
      continue;
    }

    const stepId = asString(step.step_id);
    if (!stepId) {
      issues.push({
        code: "PLAN_SCHEMA_INVALID",
        message: "Each step must include step_id",
      });
      continue;
    }

    const title = asString(step.title);
    const objective = asString(step.objective);
    const expectedOutput = asString(step.expected_output);
    const tools = asStringArray(step.tools);

    if (!title || !objective || !expectedOutput) {
      issues.push({
        code: "PLAN_SCHEMA_INVALID",
        message: "Each step must include title, objective, and expected_output",
        stepId,
      });
      continue;
    }

    for (const toolName of tools) {
      const tool = input.toolRegistry[toolName];
      if (!tool) {
        issues.push({
          code: "PLAN_INVALID_TOOL",
          message: `Unknown tool in step: ${toolName}`,
          stepId,
        });
        continue;
      }

      if (!allowlist.has(toolName)) {
        issues.push({
          code: "PLAN_TOOL_NOT_ALLOWED",
          message: `Tool is not in skill allowlist: ${toolName}`,
          stepId,
        });
      }

      if (!input.manifestToolNames.has(toolName)) {
        issues.push({
          code: "PLAN_INVALID_TOOL",
          message: `Tool is not available in installation manifest: ${toolName}`,
          stepId,
        });
      }
    }

    const pageCountEstimate = toPositiveInt(step.page_count_estimate, 0);
    const toolCallEstimate = toPositiveInt(step.tool_call_estimate, tools.length);

    totalPages += pageCountEstimate;
    totalToolCalls += toolCallEstimate;

    normalizedSteps.push({
      stepId,
      title,
      objective,
      tools,
      expectedOutput,
      pageCountEstimate,
      toolCallEstimate,
    });
  }

  if (new Set(normalizedSteps.map((step) => step.stepId)).size !== normalizedSteps.length) {
    issues.push({
      code: "PLAN_SCHEMA_INVALID",
      message: "step_id values must be unique",
    });
  }

  const effectiveMaxSteps = Math.min(
    input.policy.maxSteps,
    input.skill.caps.maxSteps ?? Number.MAX_SAFE_INTEGER,
  );
  if (normalizedSteps.length > effectiveMaxSteps) {
    issues.push({
      code: "PLAN_STEP_CAP_EXCEEDED",
      message: `Step count ${normalizedSteps.length} exceeds cap ${effectiveMaxSteps}`,
    });
  }

  const effectiveMaxToolCalls = Math.min(
    input.policy.maxToolCalls,
    input.skill.caps.maxToolCalls ?? Number.MAX_SAFE_INTEGER,
  );
  if (totalToolCalls > effectiveMaxToolCalls) {
    issues.push({
      code: "PLAN_STEP_CAP_EXCEEDED",
      message: `Estimated tool calls ${totalToolCalls} exceed cap ${effectiveMaxToolCalls}`,
    });
  }

  const effectiveMaxPages = Math.min(
    input.policy.maxPages,
    input.skill.caps.maxPages ?? Number.MAX_SAFE_INTEGER,
  );
  if (totalPages > effectiveMaxPages) {
    issues.push({
      code: "PLAN_PAGE_CAP_EXCEEDED",
      message: `Estimated pages ${totalPages} exceed cap ${effectiveMaxPages}`,
    });
  }

  if (issues.length > 0 || !inputsRecord || !skillId || !goal) {
    return {
      plan: null,
      issues,
    };
  }

  return {
    plan: {
      planVersion: 1,
      skillId,
      goal,
      assumptions,
      inputs: inputsRecord,
      steps: normalizedSteps,
    },
    issues,
  };
}
