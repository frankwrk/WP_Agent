import assert from "node:assert/strict";
import test from "node:test";
import { validatePlanDraft } from "../../src/services/plans/plan.validate";
import { getToolRegistry } from "../../src/services/plans/tool.registry";
import type { NormalizedSkillSpec } from "../../src/services/skills/normalize";

const skill: NormalizedSkillSpec = {
  skillId: "wp.content.audit",
  version: "1.0.0",
  sourceRepo: "https://github.com/example/skills",
  sourceCommitSha: "d5afdf4",
  sourcePath: "skills/content-audit/skill.json",
  name: "Content Audit",
  description: "Audit content",
  tags: ["seo"],
  inputsSchema: { type: "object", properties: {} },
  outputsSchema: { type: "object", properties: {} },
  toolAllowlist: ["site.get_environment", "content.inventory"],
  caps: { maxPages: 100, maxToolCalls: 20, maxSteps: 8, maxCostUsd: 2 },
  safetyClass: "read",
  deprecated: false,
};

const policy = {
  policyPreset: "balanced" as const,
  model: "gpt-4.1",
  maxSteps: 10,
  maxToolCalls: 50,
  maxPages: 200,
  maxCostUsd: 5,
};

test("validatePlanDraft accepts valid plan", () => {
  const result = validatePlanDraft({
    parsed: {
      plan_version: 1,
      skill_id: "wp.content.audit",
      goal: "Audit the site",
      assumptions: ["Site has posts"],
      inputs: { locale: "en" },
      steps: [
        {
          step_id: "step-1",
          title: "Collect environment",
          objective: "Get environment details",
          tools: ["site.get_environment"],
          expected_output: "Environment summary",
          tool_call_estimate: 1,
        },
      ],
    },
    skill,
    policy,
    toolRegistry: getToolRegistry(),
    manifestToolNames: new Set(["site.get_environment", "content.inventory", "seo.get_config"]),
  });

  assert.equal(result.issues.length, 0);
  assert.ok(result.plan);
});

test("validatePlanDraft flags unknown tools", () => {
  const result = validatePlanDraft({
    parsed: {
      plan_version: 1,
      skill_id: "wp.content.audit",
      goal: "Audit",
      assumptions: [],
      inputs: {},
      steps: [
        {
          step_id: "step-1",
          title: "Bad tool",
          objective: "Use unknown tool",
          tools: ["unknown.tool"],
          expected_output: "n/a",
        },
      ],
    },
    skill,
    policy,
    toolRegistry: getToolRegistry(),
    manifestToolNames: new Set(["site.get_environment", "content.inventory"]),
  });

  assert.equal(result.plan, null);
  assert.ok(result.issues.some((issue) => issue.code === "PLAN_INVALID_TOOL"));
});

test("validatePlanDraft flags allowlist violations", () => {
  const result = validatePlanDraft({
    parsed: {
      plan_version: 1,
      skill_id: "wp.content.audit",
      goal: "Audit",
      assumptions: [],
      inputs: {},
      steps: [
        {
          step_id: "step-1",
          title: "Use disallowed tool",
          objective: "Call seo config",
          tools: ["seo.get_config"],
          expected_output: "seo",
        },
      ],
    },
    skill,
    policy,
    toolRegistry: getToolRegistry(),
    manifestToolNames: new Set(["site.get_environment", "content.inventory", "seo.get_config"]),
  });

  assert.ok(result.issues.some((issue) => issue.code === "PLAN_TOOL_NOT_ALLOWED"));
});
