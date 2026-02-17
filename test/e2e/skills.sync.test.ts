import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../../src/server";
import type { AppConfig } from "../../src/config";
import { MemorySkillStore } from "../../src/services/skills/store";
import { SkillIngestError } from "../../src/services/skills/ingest.github";

const INSTALLATION_ID = "be64bcac-5d68-4513-9f2f-c0ee31cad81c";

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

test("POST /api/v1/skills/sync enforces bootstrap auth", async () => {
  const store = new MemorySkillStore();
  store.pairedInstallations.add(INSTALLATION_ID);

  const app = await buildServer({
    skills: {
      store,
      config: testConfig(),
      ingestSnapshot: async () => {
        return {
          repoUrl: "https://github.com/example/skills",
          commitSha: "d5afdf4",
          ingestionHash: "abc123",
          documents: [],
        };
      },
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/skills/sync",
    payload: {
      installation_id: INSTALLATION_ID,
      repo_url: "https://github.com/example/skills",
      commit_sha: "d5afdf4",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "SKILLS_AUTH_FAILED");

  await app.close();
});

test("POST /api/v1/skills/sync ingests normalized skills", async () => {
  const store = new MemorySkillStore();
  store.pairedInstallations.add(INSTALLATION_ID);

  const app = await buildServer({
    skills: {
      store,
      config: testConfig(),
      ingestSnapshot: async () => {
        return {
          repoUrl: "https://github.com/example/skills",
          commitSha: "d5afdf4",
          ingestionHash: "abc123",
          documents: [
            {
              path: "skills/content-audit/skill.json",
              content: JSON.stringify({
                skill_id: "wp.content.audit",
                version: "1.0.0",
                name: "Content Audit",
                description: "Audit content inventory",
                tags: ["seo"],
                inputs_schema: { type: "object", properties: {} },
                outputs_schema: { type: "object", properties: {} },
                tool_allowlist: ["site.get_environment", "content.inventory"],
                caps: { max_pages: 20, max_tool_calls: 10 },
                safety_class: "read",
              }),
            },
          ],
        };
      },
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/skills/sync",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      repo_url: "https://github.com/example/skills",
      commit_sha: "d5afdf4",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.skill_count, 1);

  const listResponse = await app.inject({
    method: "GET",
    url: `/api/v1/skills?installation_id=${INSTALLATION_ID}`,
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
  });

  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().data.items.length, 1);

  await app.close();
});

test("POST /api/v1/skills/sync rejects unknown tools during ingestion", async () => {
  const store = new MemorySkillStore();
  store.pairedInstallations.add(INSTALLATION_ID);

  const app = await buildServer({
    skills: {
      store,
      config: testConfig(),
      ingestSnapshot: async () => {
        return {
          repoUrl: "https://github.com/example/skills",
          commitSha: "d5afdf4",
          ingestionHash: "abc123",
          documents: [
            {
              path: "skills/unknown-tool/skill.json",
              content: JSON.stringify({
                skill_id: "wp.bad.skill",
                version: "1.0.0",
                description: "Uses unknown tool",
                tags: ["seo"],
                inputs_schema: { type: "object", properties: {} },
                outputs_schema: { type: "object", properties: {} },
                tool_allowlist: ["unknown.tool"],
                caps: { max_pages: 5, max_tool_calls: 2 },
                safety_class: "read",
              }),
            },
          ],
        };
      },
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/skills/sync",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      repo_url: "https://github.com/example/skills",
      commit_sha: "d5afdf4",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "SKILL_UNKNOWN_TOOL");

  await app.close();
});

test("POST /api/v1/skills/sync enforces commit pin requirement", async () => {
  const store = new MemorySkillStore();
  store.pairedInstallations.add(INSTALLATION_ID);

  const app = await buildServer({
    skills: {
      store,
      config: testConfig(),
      ingestSnapshot: async ({ commitSha }: { commitSha: string }) => {
        if (!/^[0-9a-f]{7,64}$/i.test(commitSha)) {
          throw new SkillIngestError("SKILL_COMMIT_REQUIRED", "commit_sha must be pinned");
        }

        return {
          repoUrl: "https://github.com/example/skills",
          commitSha,
          ingestionHash: "abc123",
          documents: [],
        };
      },
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/skills/sync",
    headers: {
      "x-wp-agent-bootstrap": "test-bootstrap-secret",
    },
    payload: {
      installation_id: INSTALLATION_ID,
      repo_url: "https://github.com/example/skills",
      commit_sha: "HEAD",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "SKILL_COMMIT_REQUIRED");

  await app.close();
});
