import assert from "node:assert/strict";
import test from "node:test";
import { selectModelForPolicy } from "../../src/services/llm/model.select";
import type { ChatPolicy } from "../../src/services/policy/policy.schema";

const policy: ChatPolicy = {
  preset: "balanced",
  model: "anthropic/claude-sonnet-4.5",
  maxInputChars: 4000,
  maxPromptMessages: 12,
  rateLimitPerMinute: 60,
  dailyTokenCap: 100000,
};

test("selectModelForPolicy returns deterministic routingReason", () => {
  const first = selectModelForPolicy({
    policy,
    policyPreset: "balanced",
    taskClass: "planning",
    explicitPreference: "quality",
    routeDefaultPreference: "balanced",
  });

  const second = selectModelForPolicy({
    policy,
    policyPreset: "balanced",
    taskClass: "planning",
    explicitPreference: "quality",
    routeDefaultPreference: "balanced",
  });

  assert.equal(first.model, second.model);
  assert.equal(first.preference, second.preference);
  assert.equal(first.routingReason, second.routingReason);
  assert.match(
    first.routingReason,
    /^policy:balanced task:planning pref:quality candidates:\[.*\] => .+$/,
  );
});
