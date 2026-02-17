import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../../src/server";
import type { AppConfig } from "../../src/config";
import { MemoryPlanStore } from "../../src/services/plans/store";
import { MemorySkillStore } from "../../src/services/skills/store";
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  LlmClient,
} from "../../src/services/llm/openrouter.client";

const INSTALLATION_ID = "30e9a742-a749-42ca-ac5e-16b55dbe7258";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3001,
    databaseUrl: "",
    openrouterApiKey: "test-key",
    openrouterBaseUrl: "https://openrouter.test/api/v1",
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
    ...overrides,
  };
}

class StaticLlmClient implements LlmClient {
  constructor(private readonly result: ChatCompletionResult) {}

  async completeChat(_request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return this.result;
  }
}

async function seedSkillStore(skillStore: MemorySkillStore) {
  skillStore.pairedInstallations.add(INSTALLATION_ID);

  const ingestion = await skillStore.createIngestion({
    installationId: INSTALLATION_ID,
    repoUrl: "https://github.com/example/skills",
    commitSha: "d5afdf4",
    ingestionHash: "abc123",
  });

  await skillStore.replaceSkillSpecs({
    installationId: INSTALLATION_ID,
    ingestionId: ingestion.ingestionId,
    specs: [
      {
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
        caps: { maxPages: 50, maxToolCalls: 20, maxSteps: 8, maxCostUsd: 2 },
        safetyClass: "read",
        deprecated: false,
      },
    ],
  });

  await skillStore.updateIngestionStatus({
    ingestionId: ingestion.ingestionId,
    status: "succeeded",
  });
}

test("POST /api/v1/plans/:id/approve transitions validated -> approved only", async () => {
  const skillStore = new MemorySkillStore();
  await seedSkillStore(skillStore);

  const planStore = new MemoryPlanStore();
  planStore.pairedInstallations.add(INSTALLATION_ID);

  const llm = new StaticLlmClient({
    content: `\`\`\`json
{
  "plan_version": 1,
  "skill_id": "wp.content.audit",
  "goal": "Audit content inventory",
  "assumptions": [],
  "inputs": {},
  "steps": [
    {
      "step_id": "step-1",
      "title": "Read site environment",
      "objective": "Fetch runtime environment",
      "tools": ["site.get_environment"],
      "expected_output": "Environment summary",
      "tool_call_estimate": 1
    }
  ]
}
\`\`\``,
    model: "gpt-4.1",
    usageTokens: 120,
  });

  const app = await buildServer({
    runs: {
      config: testConfig(),
      planStore,
      skillStore,
      llmClient: llm,
      manifestToolsLoader: async () =>
        new Set(["site.get_environment", "content.inventory", "seo.get_config"]),
    },
  });

  const draft = await app.inject({
    method: "POST",
    url: "/api/v1/plans/draft",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 15,
      policy_preset: "balanced",
      skill_id: "wp.content.audit",
      goal: "Audit content inventory",
      inputs: {},
    },
  });

  assert.equal(draft.statusCode, 200);
  assert.equal(draft.json().data.plan.status, "validated");

  const planId = draft.json().data.plan.plan_id as string;

  const approve = await app.inject({
    method: "POST",
    url: `/api/v1/plans/${planId}/approve`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 15,
    },
  });

  assert.equal(approve.statusCode, 200);
  assert.equal(approve.json().data.plan.status, "approved");
  assert.ok(
    approve
      .json()
      .data.events.some((event: { event_type: string }) => event.event_type === "approved"),
  );

  const approveAgain = await app.inject({
    method: "POST",
    url: `/api/v1/plans/${planId}/approve`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 15,
    },
  });

  assert.equal(approveAgain.statusCode, 409);
  assert.equal(approveAgain.json().error.code, "PLAN_NOT_APPROVABLE");

  await app.close();
});
