import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSinglePlanJsonBlock,
  PlanParseError,
} from "../../src/services/plans/plan.parse";

test("parseSinglePlanJsonBlock accepts raw JSON", () => {
  const parsed = parseSinglePlanJsonBlock(
    JSON.stringify({
      plan_version: 1,
      skill_id: "wp.content.audit",
      goal: "audit",
      assumptions: [],
      inputs: {},
      steps: [
        {
          step_id: "step-1",
          title: "Inspect",
          objective: "Inspect content",
          tools: ["content.inventory"],
          expected_output: "Inventory summary",
        },
      ],
    }),
  );

  assert.equal(parsed.skill_id, "wp.content.audit");
});

test("parseSinglePlanJsonBlock accepts one fenced json block", () => {
  const parsed = parseSinglePlanJsonBlock(
    "```json\n"
      + "{\"plan_version\":1,\"skill_id\":\"a\",\"goal\":\"b\",\"assumptions\":[],\"inputs\":{},\"steps\":[]}\n"
      + "```",
  );

  assert.equal(parsed.plan_version, 1);
});

test("parseSinglePlanJsonBlock rejects multi block output", () => {
  assert.throws(
    () =>
      parseSinglePlanJsonBlock(
        "```json\n{}\n```\n```json\n{}\n```",
      ),
    (error) => {
      assert.ok(error instanceof PlanParseError);
      assert.equal(error.code, "PLAN_PARSE_MULTIBLOCK");
      return true;
    },
  );
});

test("parseSinglePlanJsonBlock rejects prose around fenced json", () => {
  assert.throws(
    () => parseSinglePlanJsonBlock("Plan follows\n```json\n{}\n```"),
    (error) => {
      assert.ok(error instanceof PlanParseError);
      assert.equal(error.code, "PLAN_PARSE_NONJSON");
      return true;
    },
  );
});
