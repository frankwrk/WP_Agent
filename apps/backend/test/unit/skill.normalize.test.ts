import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSkillSpec,
  SkillNormalizationError,
} from "../../src/services/skills/normalize";

test("normalizeSkillSpec normalizes canonical fields and provenance", () => {
  const skill = normalizeSkillSpec(
    {
      skill_id: "wp.content.audit",
      version: "1.0.0",
      name: "Content Audit",
      description: "Audit site content inventory",
      tags: ["SEO", "Audit"],
      inputs_schema: { type: "object", properties: { section: { type: "string" } } },
      outputs_schema: { type: "object", properties: { report: { type: "string" } } },
      tool_allowlist: ["site.get_environment", "content.inventory"],
      caps: { max_pages: 50, max_tool_calls: 12, max_steps: 8, max_cost_usd: 1.5 },
      safety_class: "read",
    },
    {
      repoUrl: "https://github.com/example/skills",
      commitSha: "d5afdf4",
      path: "skills/content-audit/skill.json",
    },
  );

  assert.equal(skill.skillId, "wp.content.audit");
  assert.equal(skill.sourceCommitSha, "d5afdf4");
  assert.deepEqual(skill.tags, ["seo", "audit"]);
  assert.equal(skill.caps.maxCostUsd, 1.5);
});

test("normalizeSkillSpec rejects invalid payload", () => {
  assert.throws(
    () =>
      normalizeSkillSpec(
        {
          version: "1.0.0",
          description: "missing skill id",
          tool_allowlist: ["site.get_environment"],
          safety_class: "read",
        },
        {
          repoUrl: "https://github.com/example/skills",
          commitSha: "d5afdf4",
          path: "skills/missing/skill.json",
        },
      ),
    (error) => {
      assert.ok(error instanceof SkillNormalizationError);
      assert.equal(error.code, "SKILL_SCHEMA_INVALID");
      return true;
    },
  );
});
