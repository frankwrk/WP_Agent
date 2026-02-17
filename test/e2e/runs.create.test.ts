import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../src/server";
import type { AppConfig } from "../../src/config";
import { MemoryPlanStore } from "../../src/services/plans/store";
import { MemorySkillStore } from "../../src/services/skills/store";
import { MemoryRunStore } from "../../src/services/runs/store";
import { RunExecutor } from "../../src/services/runs/executor";

const INSTALLATION_ID = "b41e0f25-b4fd-4e77-a6ea-0d4a75f62098";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3001,
    databaseUrl: "",
    aiGatewayApiKey: "test-key",
    aiGatewayBaseUrl: "https://ai-gateway.test/v1",
    pairingBootstrapSecret: "test-bootstrap-secret",
    signatureTtlSeconds: 180,
    signatureMaxSkewSeconds: 300,
    backendSigningPrivateKey:
      "tymBbZJonEa5diaN8AdqxQB8r3n0kbyH8LfSExagF+QGDUymnMJ37gDXKwFlrdwC8e3LMvOOgUZKLK9i4tnlfw==",
    backendSigningAudience: "wp-agent-runtime",
    backendPublicBaseUrl: "http://backend.test",
    wpToolApiBase: "http://localhost:8080/wp-json/wp-agent/v1",
    pairingRateLimitPerMinuteIp: 100,
    pairingRateLimitPerMinuteInstallation: 20,
    chatModelFast: "gpt-4.1-mini",
    chatModelBalanced: "gpt-4.1",
    chatModelQuality: "anthropic/claude-sonnet-4",
    chatModelReasoning: "o3",
    chatRateLimitPerMinute: 100,
    chatDailyTokenCap: 100000,
    chatMaxPromptMessages: 12,
    chatMaxInputChars: 4000,
    chatSessionRetentionDays: 30,
    skillSourceRepoUrl: "",
    skillSourceCommitSha: "",
    planMaxSteps: 12,
    planMaxToolCalls: 40,
    planMaxPages: 200,
    planMaxCostUsd: 5,
    runMaxSteps: 12,
    runMaxToolCalls: 40,
    runMaxPages: 200,
    runMaxPagesPerBulk: 50,
    runJobPollIntervalMs: 5,
    runJobPollAttempts: 20,
    ...overrides,
  };
}

async function seed(planStore: MemoryPlanStore, skillStore: MemorySkillStore): Promise<string> {
  planStore.pairedInstallations.add(INSTALLATION_ID);
  skillStore.pairedInstallations.add(INSTALLATION_ID);

  const ingestion = await skillStore.createIngestion({
    installationId: INSTALLATION_ID,
    repoUrl: "https://example.com",
    commitSha: "abc",
    ingestionHash: "hash",
  });

  await skillStore.replaceSkillSpecs({
    installationId: INSTALLATION_ID,
    ingestionId: ingestion.ingestionId,
    specs: [
      {
        skillId: "wp.pseo.generate",
        version: "1.0.0",
        sourceRepo: "https://example.com",
        sourceCommitSha: "abc",
        sourcePath: "skills/pseo/skill.json",
        name: "pSEO",
        description: "Generate drafts",
        tags: ["seo"],
        inputsSchema: {},
        outputsSchema: {},
        toolAllowlist: ["content.bulk_create"],
        caps: { maxPages: 50, maxToolCalls: 20, maxSteps: 8, maxCostUsd: 2 },
        safetyClass: "write_draft",
        deprecated: false,
      },
    ],
  });

  await skillStore.updateIngestionStatus({
    ingestionId: ingestion.ingestionId,
    status: "succeeded",
  });

  const planId = randomUUID();
  await planStore.createPlan({
    planId,
    installationId: INSTALLATION_ID,
    wpUserId: 2,
    skillId: "wp.pseo.generate",
    policyPreset: "balanced",
    status: "approved",
    goal: "Create drafts",
    assumptions: [],
    inputs: {
      pages: [
        {
          title: "One",
          content: "Body",
        },
      ],
    },
    steps: [
      {
        stepId: "step-create",
        title: "Create",
        objective: "Create",
        tools: ["content.bulk_create"],
        expectedOutput: "Draft",
        pageCountEstimate: 1,
        toolCallEstimate: 1,
      },
    ],
    estimates: {
      estimatedPages: 1,
      estimatedToolCalls: { "content.bulk_create": 1 },
      estimatedTokensBucket: "low",
      estimatedCostUsdBand: "low",
      estimatedRuntimeSec: 20,
      confidenceBand: "high",
      estimatedCostUsd: 0.01,
    },
    risk: {
      tier: "MEDIUM",
      score: 40,
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
  });

  return planId;
}

test("POST /api/v1/runs blocks concurrent active run per installation", async () => {
  const planStore = new MemoryPlanStore();
  const skillStore = new MemorySkillStore();
  const runStore = new MemoryRunStore();
  const planId = await seed(planStore, skillStore);

  const runExecutor = new RunExecutor({
    runStore,
    wpToolApiBase: "http://wp.test/wp-json/wp-agent/v1",
    jobPollIntervalMs: 100,
    jobPollAttempts: 100,
    invokePost: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        ok: true,
        data: {
          job_id: "11111111-1111-4111-8111-111111111111",
          status: "queued",
        },
      };
    },
    invokeGet: async () => ({
      ok: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "running",
      },
    }),
  });

  const app = await buildServer({
    runs: {
      config: testConfig(),
      planStore,
      skillStore,
      runStore,
      runExecutor,
      manifestToolsLoader: async () => new Set(),
    },
  });

  const first = await app.inject({
    method: "POST",
    url: "/api/v1/runs",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 2,
      plan_id: planId,
    },
  });

  assert.equal(first.statusCode, 202);

  const second = await app.inject({
    method: "POST",
    url: "/api/v1/runs",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 2,
      plan_id: planId,
    },
  });

  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error.code, "RUN_ACTIVE_CONFLICT");

  await app.close();
});
