import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../src/server";
import type { AppConfig } from "../../src/config";
import { MemoryPlanStore } from "../../src/services/plans/store";
import { MemorySkillStore } from "../../src/services/skills/store";
import { MemoryRunStore } from "../../src/services/runs/store";
import { RunExecutor } from "../../src/services/runs/executor";

const INSTALLATION_ID = "5f445174-4937-4c3d-8f3f-e5c6cd65f5a5";

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
    runRecoveryStaleMinutes: 15,
    runWorkerPollIntervalMs: 5,
    skillsSyncTimeoutMs: 20000,
    skillsSyncMaxDocuments: 200,
    planDraftLlmTimeoutMs: 25000,
    planDraftManifestTimeoutMs: 10000,
    planDraftMaxOutputChars: 30000,
    ...overrides,
  };
}

async function seedSkillStore(skillStore: MemorySkillStore) {
  skillStore.pairedInstallations.add(INSTALLATION_ID);

  const ingestion = await skillStore.createIngestion({
    installationId: INSTALLATION_ID,
    repoUrl: "https://github.com/example/skills",
    commitSha: "abc123",
    ingestionHash: "hash",
  });

  await skillStore.replaceSkillSpecs({
    installationId: INSTALLATION_ID,
    ingestionId: ingestion.ingestionId,
    specs: [
      {
        skillId: "wp.pseo.generate",
        version: "1.0.0",
        sourceRepo: "https://github.com/example/skills",
        sourceCommitSha: "abc123",
        sourcePath: "skills/pseo/skill.json",
        name: "pSEO",
        description: "Generate pSEO drafts",
        tags: ["seo"],
        inputsSchema: {},
        outputsSchema: {},
        toolAllowlist: ["content.create_page", "content.bulk_create"],
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
}

async function seedApprovedPlan(planStore: MemoryPlanStore): Promise<string> {
  planStore.pairedInstallations.add(INSTALLATION_ID);

  const planId = randomUUID();
  await planStore.createPlan({
    planId,
    installationId: INSTALLATION_ID,
    wpUserId: 1,
    skillId: "wp.pseo.generate",
    policyPreset: "balanced",
    status: "approved",
    goal: "Create pSEO drafts",
    assumptions: [],
    inputs: {
      pages: new Array(10).fill(0).map((_, index) => ({
        title: `Page ${index + 1}`,
        slug: `page-${index + 1}`,
        content: `Body ${index + 1}`,
      })),
    },
    steps: [
      {
        stepId: "step-create",
        title: "Create draft pages",
        objective: "Create 10 draft pages",
        tools: ["content.bulk_create"],
        expectedOutput: "Draft pages",
        pageCountEstimate: 10,
        toolCallEstimate: 1,
      },
    ],
    estimates: {
      estimatedPages: 10,
      estimatedToolCalls: { "content.bulk_create": 1 },
      estimatedTokensBucket: "low",
      estimatedCostUsdBand: "low",
      estimatedRuntimeSec: 20,
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
  });

  return planId;
}

test("M4 pSEO smoke: approved plan run creates 10 drafts", async () => {
  const planStore = new MemoryPlanStore();
  const skillStore = new MemorySkillStore();
  const runStore = new MemoryRunStore();

  await seedSkillStore(skillStore);
  const planId = await seedApprovedPlan(planStore);

  let jobPollCount = 0;
  const runExecutor = new RunExecutor({
    runStore,
    wpToolApiBase: "http://wp.test/wp-json/wp-agent/v1",
    jobPollIntervalMs: 5,
    jobPollAttempts: 20,
    invokePost: async ({ url }) => {
      if (url.endsWith("/content/bulk-create")) {
        return {
          ok: true,
          data: {
            job_id: "11111111-1111-4111-8111-111111111111",
            status: "queued",
          },
        };
      }

      throw new Error(`Unexpected POST URL ${url}`);
    },
    invokeGet: async ({ url }) => {
      if (!url.includes("/jobs/11111111-1111-4111-8111-111111111111")) {
        throw new Error(`Unexpected GET URL ${url}`);
      }

      jobPollCount += 1;
      if (jobPollCount < 2) {
        return {
          ok: true,
          data: {
            job_id: "11111111-1111-4111-8111-111111111111",
            status: "running",
          },
        };
      }

      return {
        ok: true,
        data: {
          job_id: "11111111-1111-4111-8111-111111111111",
          status: "completed",
          progress: {
            total_items: 10,
            processed_items: 10,
            created_items: 10,
            failed_items: 0,
          },
          rollback_handles: new Array(10).fill(0).map((_, index) => ({
            handle_id: `rh-${index + 1}`,
            kind: "delete_post",
            payload: { post_id: index + 1 },
          })),
          errors: [],
        },
      };
    },
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

  const create = await app.inject({
    method: "POST",
    url: "/api/v1/runs",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 1,
      plan_id: planId,
    },
  });

  assert.equal(create.statusCode, 202);
  const runId = create.json().data.run.run_id as string;

  let details = await app.inject({
    method: "GET",
    url: `/api/v1/runs/${runId}?installation_id=${INSTALLATION_ID}&wp_user_id=1`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (details.json().data.run.status === "completed") {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
    details = await app.inject({
      method: "GET",
      url: `/api/v1/runs/${runId}?installation_id=${INSTALLATION_ID}&wp_user_id=1`,
      headers: {
        "x-wp-agent-bootstrap": "test-bootstrap-secret",
      },
    });
  }

  assert.equal(details.statusCode, 200);
  assert.equal(details.json().data.run.status, "completed");
  assert.equal(details.json().data.run.actual_pages, 10);
  assert.equal(details.json().data.rollbacks.length, 10);

  await app.close();
});
