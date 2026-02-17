import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../src/server";
import type { AppConfig } from "../../src/config";
import { MemoryPlanStore } from "../../src/services/plans/store";
import { MemorySkillStore } from "../../src/services/skills/store";
import { MemoryRunStore } from "../../src/services/runs/store";
import { RunExecutor } from "../../src/services/runs/executor";

const INSTALLATION_ID = "ee9c7008-7bf2-47df-bb85-3460d4181e13";

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

test("POST /api/v1/runs/:id/rollback applies pending handles", async () => {
  const planStore = new MemoryPlanStore();
  const skillStore = new MemorySkillStore();
  const runStore = new MemoryRunStore();
  planStore.pairedInstallations.add(INSTALLATION_ID);

  const runId = randomUUID();
  await runStore.createRun({
    runId,
    installationId: INSTALLATION_ID,
    wpUserId: 9,
    planId: randomUUID(),
    plannedSteps: 1,
    plannedToolCalls: 1,
    plannedPages: 1,
    inputPayload: {
      mode: "single",
      step_id: "step-1",
      pages: [{ title: "Page", content: "Body" }],
    },
    steps: [
      {
        stepId: "step-1",
        plannedToolCalls: 1,
        plannedPages: 1,
      },
    ],
  });

  await runStore.setRunStatus({
    runId,
    status: "failed",
    errorCode: "RUN_EXECUTION_FAILED",
    errorMessage: "failure",
  });

  await runStore.addRunRollbacks({
    runId,
    handles: [
      {
        handleId: "rollback-handle-1",
        kind: "delete_post",
        payload: { post_id: 1 },
      },
    ],
  });
  await runStore.setRunRollbackAvailable(runId, true);

  const runExecutor = new RunExecutor({
    runStore,
    wpToolApiBase: "http://wp.test/wp-json/wp-agent/v1",
    jobPollIntervalMs: 5,
    jobPollAttempts: 20,
    invokePost: async ({ url }) => {
      assert.equal(url.endsWith("/rollback/apply"), true);
      return {
        ok: true,
        data: {
          run_id: runId,
          summary: {
            total: 1,
            applied: 1,
            failed: 0,
          },
          results: [
            {
              handle_id: "rollback-handle-1",
              status: "applied",
            },
          ],
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

  const response = await app.inject({
    method: "POST",
    url: `/api/v1/runs/${runId}/rollback`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 9,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.run.status, "rolled_back");
  assert.equal(response.json().data.rollbacks[0].status, "applied");

  await app.close();
});
