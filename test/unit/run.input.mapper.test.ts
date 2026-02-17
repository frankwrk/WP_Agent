import assert from "node:assert/strict";
import test from "node:test";
import { mapRunExecutionInput, RunInputError } from "../../src/services/runs/input.mapper";
import type { PlanRecord } from "../../src/services/plans/store";
import type { NormalizedSkillSpec } from "../../src/services/skills/normalize";

function samplePlan(inputs: Record<string, unknown>): PlanRecord {
  return {
    planId: "76f90f4f-70ee-4bb8-af89-f5e5f63e1848",
    installationId: "80fbf8e8-5df7-4541-8f8e-3ce60820e6d7",
    wpUserId: 1,
    skillId: "wp.pseo.generate",
    policyPreset: "balanced",
    status: "approved",
    goal: "Create pSEO drafts",
    assumptions: [],
    inputs,
    steps: [
      {
        stepId: "step-1",
        title: "Create drafts",
        objective: "Create drafts",
        tools: ["content.bulk_create"],
        expectedOutput: "Drafts created",
        pageCountEstimate: 10,
        toolCallEstimate: 1,
      },
    ],
    estimates: {
      estimatedPages: 10,
      estimatedToolCalls: { "content.bulk_create": 1 },
      estimatedTokensBucket: "low",
      estimatedCostUsdBand: "low",
      estimatedRuntimeSec: 30,
      confidenceBand: "high",
      estimatedCostUsd: 0.01,
    },
    risk: {
      tier: "MEDIUM",
      score: 45,
      factors: {
        numberOfSteps: 1,
        writeIntensity: 0.5,
        toolNovelty: 0.2,
        costRatioToCap: 0.01,
      },
    },
    policyContext: {
      policyPreset: "balanced",
      model: "gpt-4.1",
      maxSteps: 12,
      maxToolCalls: 40,
      maxPages: 200,
      maxCostUsd: 5,
    },
    planHash: "hash",
    validationIssues: [],
    llmUsageTokens: 100,
    llm: {
      selectedModel: "gpt-4.1",
      taskClass: "planning",
      preference: "quality",
      requestId: "llm-req-seed",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function sampleSkill(): NormalizedSkillSpec {
  return {
    skillId: "wp.pseo.generate",
    version: "1.0.0",
    sourceRepo: "https://example.com",
    sourceCommitSha: "abc",
    sourcePath: "skills/pseo/skill.json",
    name: "pSEO",
    description: "Generate pSEO drafts",
    tags: ["seo"],
    inputsSchema: {},
    outputsSchema: {},
    toolAllowlist: ["content.bulk_create", "content.create_page"],
    caps: {
      maxPages: 50,
      maxSteps: 8,
      maxToolCalls: 20,
      maxCostUsd: 2,
    },
    safetyClass: "write_draft",
    deprecated: false,
  };
}

test("mapRunExecutionInput maps valid pages[] payload", () => {
  const mapped = mapRunExecutionInput({
    plan: samplePlan({
      pages: [
        {
          title: "Page One",
          slug: "page-one",
          content: "Body",
        },
      ],
    }),
    skill: sampleSkill(),
    envCaps: {
      maxSteps: 12,
      maxToolCalls: 40,
      maxPages: 200,
    },
    maxPagesPerBulk: 50,
  });

  assert.equal(mapped.mode, "single");
  assert.equal(mapped.plannedPages, 1);
  assert.equal(mapped.pages[0].title, "Page One");
});

test("mapRunExecutionInput rejects when pages exceeds cap", () => {
  assert.throws(
    () =>
      mapRunExecutionInput({
        plan: samplePlan({
          pages: new Array(60).fill(0).map((_, index) => ({
            title: `Page ${index + 1}`,
            content: "Body",
          })),
        }),
        skill: sampleSkill(),
        envCaps: {
          maxSteps: 12,
          maxToolCalls: 40,
          maxPages: 200,
        },
        maxPagesPerBulk: 50,
      }),
    (error: unknown) => error instanceof RunInputError && error.code === "RUN_PAGE_CAP_EXCEEDED",
  );
});
