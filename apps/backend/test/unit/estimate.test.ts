import assert from "node:assert/strict";
import test from "node:test";
import { estimatePlan } from "../../src/services/plans/estimate";
import { getToolRegistry } from "../../src/services/plans/tool.registry";

const steps = [
  {
    stepId: "step-1",
    title: "Inspect environment",
    objective: "Read site data",
    tools: ["site.get_environment"],
    expectedOutput: "site summary",
    pageCountEstimate: 0,
    toolCallEstimate: 1,
  },
  {
    stepId: "step-2",
    title: "Inventory content",
    objective: "Read inventory",
    tools: ["content.inventory"],
    expectedOutput: "inventory summary",
    pageCountEstimate: 20,
    toolCallEstimate: 2,
  },
];

test("estimatePlan is deterministic for identical inputs", () => {
  const first = estimatePlan({
    steps,
    toolRegistry: getToolRegistry(),
    maxCostUsd: 3,
  });

  const second = estimatePlan({
    steps,
    toolRegistry: getToolRegistry(),
    maxCostUsd: 3,
  });

  assert.deepEqual(first, second);
});

test("estimatePlan emits PLAN_COST_CAP_EXCEEDED when projected cost is above cap", () => {
  const result = estimatePlan({
    steps,
    toolRegistry: getToolRegistry(),
    maxCostUsd: 0.001,
  });

  assert.ok(result.gatingIssues.some((issue) => issue.code === "PLAN_COST_CAP_EXCEEDED"));
});
