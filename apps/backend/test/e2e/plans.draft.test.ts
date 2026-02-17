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
} from "../../src/services/llm/ai-gateway.client";

const INSTALLATION_ID = "6ca8a6f8-7a9d-46a6-9d7a-e48938cf4f7e";

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
    runJobPollIntervalMs: 1500,
    runJobPollAttempts: 60,
    ...overrides,
  };
}

class StaticLlmClient implements LlmClient {
  public readonly requests: ChatCompletionRequest[] = [];

  constructor(private readonly result: ChatCompletionResult) {}

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    this.requests.push(request);
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

test("POST /api/v1/plans/draft persists plan and events", async () => {
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
  "assumptions": ["Site has pages"],
  "inputs": {"section": "all"},
  "steps": [
    {
      "step_id": "step-1",
      "title": "Read site environment",
      "objective": "Fetch runtime environment",
      "tools": ["site.get_environment"],
      "expected_output": "Environment summary",
      "tool_call_estimate": 1
    },
    {
      "step_id": "step-2",
      "title": "Read inventory",
      "objective": "Fetch content inventory",
      "tools": ["content.inventory"],
      "expected_output": "Inventory summary",
      "page_count_estimate": 10,
      "tool_call_estimate": 2
    }
  ]
}
\`\`\``,
    model: "gpt-4.1",
    usageTokens: 250,
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
      wp_user_id: 7,
      policy_preset: "balanced",
      skill_id: "wp.content.audit",
      goal: "Audit content inventory",
      inputs: {
        section: "all",
      },
    },
  });

  assert.equal(draft.statusCode, 200);
  assert.equal(typeof draft.headers["x-request-id"], "string");
  assert.equal(draft.json().meta.request_id, draft.headers["x-request-id"]);
  assert.equal(draft.json().data.plan.status, "validated");
  assert.equal(draft.json().data.events.length, 2);
  assert.equal(draft.json().data.plan.llm.selected_model, "gpt-4.1");
  assert.equal(draft.json().data.plan.llm.task_class, "planning");
  assert.equal(draft.json().data.plan.llm.preference, "quality");
  assert.equal(typeof draft.json().data.plan.llm.request_id, "string");
  assert.equal("llm_model" in draft.json().data.plan, false);

  const planId = draft.json().data.plan.plan_id as string;
  const fetched = await app.inject({
    method: "GET",
    url: `/api/v1/plans/${planId}?installation_id=${INSTALLATION_ID}&wp_user_id=7`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
  });

  assert.equal(fetched.statusCode, 200);
  assert.equal(typeof fetched.headers["x-request-id"], "string");
  assert.equal(fetched.json().meta.request_id, fetched.headers["x-request-id"]);
  assert.equal(fetched.json().data.plan.plan_id, planId);
  assert.equal(fetched.json().data.plan.llm.selected_model, "gpt-4.1");
  assert.equal("llm_model" in fetched.json().data.plan, false);

  const denied = await app.inject({
    method: "GET",
    url: `/api/v1/plans/${planId}?installation_id=${INSTALLATION_ID}&wp_user_id=8`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
  });

  assert.equal(denied.statusCode, 404);

  await app.close();
});
