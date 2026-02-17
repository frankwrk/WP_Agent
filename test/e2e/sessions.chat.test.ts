import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../../src/server";
import type { AppConfig } from "../../src/config";
import {
  MemorySessionsStore,
  type SessionContextLoader,
  type SessionsRouteOptions,
} from "../../src/routes/sessions";
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  LlmClient,
} from "../../src/services/llm/openrouter.client";

const INSTALLATION_ID = "1655a4af-6678-4ebe-a570-58f49fa2f73d";

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
    chatDailyTokenCap: 10000,
    chatMaxPromptMessages: 12,
    chatMaxInputChars: 4000,
    chatSessionRetentionDays: 30,
    ...overrides,
  };
}

class StaticContextLoader implements SessionContextLoader {
  public calls = 0;

  async load(): Promise<Record<string, unknown>> {
    this.calls += 1;
    return {
      fetched_at: "2026-02-16T00:00:00.000Z",
      site_environment: {
        site_url: "http://localhost:8080",
      },
      content_inventory: {
        summary: { total_items: 10 },
      },
      seo_config: {
        provider: "none",
      },
      manifest: {
        tools: [
          { name: "site.get_environment" },
          { name: "content.inventory" },
          { name: "seo.get_config" },
        ],
      },
    };
  }
}

class FakeLlmClient implements LlmClient {
  public requests: ChatCompletionRequest[] = [];

  constructor(private readonly result: ChatCompletionResult) {}

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    this.requests.push(request);
    return this.result;
  }
}

async function buildSessionsApp(options: {
  store?: MemorySessionsStore;
  contextLoader?: StaticContextLoader;
  llm?: FakeLlmClient;
  config?: AppConfig;
  markPaired?: boolean;
} = {}) {
  const store = options.store ?? new MemorySessionsStore();
  if (options.markPaired !== false) {
    store.pairedInstallations.add(INSTALLATION_ID);
  }

  const sessionsOptions: SessionsRouteOptions = {
    store,
    contextLoader: options.contextLoader ?? new StaticContextLoader(),
    llmClient: options.llm ??
      new FakeLlmClient({
        content: "Stubbed assistant response",
        model: "gpt-4.1",
        usageTokens: 42,
      }),
    config: options.config ?? testConfig(),
  };

  const app = await buildServer({ sessions: sessionsOptions });
  return {
    app,
    store,
    contextLoader: sessionsOptions.contextLoader as StaticContextLoader,
    llm: sessionsOptions.llmClient as FakeLlmClient,
  };
}

test("POST /api/v1/sessions rejects missing bootstrap auth", async () => {
  const { app } = await buildSessionsApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 1,
      policy_preset: "balanced",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "SESSION_AUTH_FAILED");

  await app.close();
});

test("POST /api/v1/sessions rejects unknown installation", async () => {
  const store = new MemorySessionsStore();
  const { app } = await buildSessionsApp({ store, markPaired: false });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 1,
      policy_preset: "balanced",
    },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.code, "INSTALLATION_NOT_PAIRED");

  await app.close();
});

test("session creation loads tool context once and resumes on repeat", async () => {
  const contextLoader = new StaticContextLoader();
  const { app } = await buildSessionsApp({ contextLoader });

  const first = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 12,
      policy_preset: "balanced",
    },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.json().data.resumed, false);
  assert.equal(contextLoader.calls, 1);

  const second = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 12,
      policy_preset: "quality",
    },
  });

  assert.equal(second.statusCode, 200);
  assert.equal(second.json().data.resumed, true);
  assert.equal(contextLoader.calls, 1);

  await app.close();
});

test("POST /api/v1/sessions/:id/messages reuses cached context and stores messages", async () => {
  const llm = new FakeLlmClient({
    content: "Inventory says you have 10 items.",
    model: "gpt-4.1",
    usageTokens: 55,
  });
  const { app, store } = await buildSessionsApp({ llm });

  const create = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 4,
      policy_preset: "balanced",
    },
  });

  const sessionId = create.json().data.session.session_id;

  const message = await app.inject({
    method: "POST",
    url: `/api/v1/sessions/${sessionId}/messages`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 4,
      content: "How many items do I have?",
    },
  });

  assert.equal(message.statusCode, 200);
  assert.equal(
    message.json().data.assistant_message.content,
    "Inventory says you have 10 items.",
  );

  const history = await store.listMessages(sessionId, 10);
  assert.equal(history.length, 2);
  assert.equal(llm.requests.length, 1);
  assert.match(llm.requests[0].messages[1].content, /WordPress context snapshot JSON/);

  await app.close();
});

test("chat budget cap returns deterministic BUDGET_EXCEEDED error", async () => {
  const config = testConfig({ chatDailyTokenCap: 10 });
  const { app, store } = await buildSessionsApp({ config });

  const create = await app.inject({
    method: "POST",
    url: "/api/v1/sessions",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 9,
      policy_preset: "balanced",
    },
  });

  const sessionId = create.json().data.session.session_id as string;
  await store.appendMessage({
    sessionId,
    role: "assistant",
    content: "Existing response",
    model: "gpt-4.1",
    usageTokens: 10,
  });

  const response = await app.inject({
    method: "POST",
    url: `/api/v1/sessions/${sessionId}/messages`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      wp_user_id: 9,
      content: "Another question",
    },
  });

  assert.equal(response.statusCode, 429);
  assert.equal(response.json().error.code, "BUDGET_EXCEEDED");

  await app.close();
});
