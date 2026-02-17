import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceDailyBudget,
  enforceMessageInputLimit,
  enforceRateLimit,
} from "../../src/services/policy/enforcement";
import { FixedWindowRateLimiter } from "../../src/services/policy/limiter";
import { buildPolicyMap } from "../../src/services/policy/policy.store";
import type { AppConfig } from "../../src/config";

function testConfig(): AppConfig {
  return {
    port: 3001,
    databaseUrl: "",
    aiGatewayApiKey: "test",
    aiGatewayBaseUrl: "https://ai-gateway.test/v1",
    pairingBootstrapSecret: "bootstrap",
    signatureTtlSeconds: 180,
    signatureMaxSkewSeconds: 300,
    backendSigningPrivateKey:
      "tymBbZJonEa5diaN8AdqxQB8r3n0kbyH8LfSExagF+QGDUymnMJ37gDXKwFlrdwC8e3LMvOOgUZKLK9i4tnlfw==",
    backendSigningAudience: "wp-agent-runtime",
    backendPublicBaseUrl: "http://localhost:3001",
    wpToolApiBase: "http://localhost:8080/wp-json/wp-agent/v1",
    pairingRateLimitPerMinuteIp: 60,
    pairingRateLimitPerMinuteInstallation: 10,
    chatModelFast: "gpt-4.1-mini",
    chatModelBalanced: "gpt-4.1",
    chatModelQuality: "anthropic/claude-sonnet-4",
    chatModelReasoning: "o3",
    chatRateLimitPerMinute: 1,
    chatDailyTokenCap: 100,
    chatMaxPromptMessages: 12,
    chatMaxInputChars: 50,
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
    runRecoveryStaleMinutes: 15,
    runWorkerPollIntervalMs: 1000,
    skillsSyncTimeoutMs: 20000,
    skillsSyncMaxDocuments: 200,
    planDraftLlmTimeoutMs: 25000,
    planDraftManifestTimeoutMs: 10000,
    planDraftMaxOutputChars: 30000,
  };
}

test("policy preset map returns configured model IDs", () => {
  const map = buildPolicyMap(testConfig());
  assert.equal(map.fast.model, "gpt-4.1-mini");
  assert.equal(map.reasoning.model, "o3");
});

test("enforceMessageInputLimit rejects oversized messages", () => {
  const policy = buildPolicyMap(testConfig()).balanced;
  const violation = enforceMessageInputLimit("x".repeat(51), policy);
  assert.equal(violation?.code, "POLICY_INPUT_TOO_LARGE");
});

test("enforceDailyBudget blocks when cap reached", () => {
  const policy = buildPolicyMap(testConfig()).balanced;
  const violation = enforceDailyBudget(100, policy);
  assert.equal(violation?.code, "BUDGET_EXCEEDED");
});

test("enforceRateLimit blocks after fixed window limit", () => {
  const limiter = new FixedWindowRateLimiter();
  const policy = buildPolicyMap(testConfig()).fast;

  const first = enforceRateLimit({
    limiter,
    key: "installation:user",
    policy,
  });

  const second = enforceRateLimit({
    limiter,
    key: "installation:user",
    policy,
  });

  assert.equal(first, null);
  assert.equal(second?.code, "RATE_LIMITED");
});
