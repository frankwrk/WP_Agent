import { getConfig } from "../../config";
import type { ChatPolicy, PolicyPreset } from "./policy.schema";

export function buildPolicyMap(config = getConfig()): Record<PolicyPreset, ChatPolicy> {
  return {
    fast: {
      preset: "fast",
      model: config.chatModelFast,
      maxOutputTokens: 350,
      maxInputChars: config.chatMaxInputChars,
      rateLimitPerMinute: config.chatRateLimitPerMinute,
      dailyTokenCap: config.chatDailyTokenCap,
    },
    balanced: {
      preset: "balanced",
      model: config.chatModelBalanced,
      maxOutputTokens: 500,
      maxInputChars: config.chatMaxInputChars,
      rateLimitPerMinute: config.chatRateLimitPerMinute,
      dailyTokenCap: config.chatDailyTokenCap,
    },
    quality: {
      preset: "quality",
      model: config.chatModelQuality,
      maxOutputTokens: 700,
      maxInputChars: config.chatMaxInputChars,
      rateLimitPerMinute: config.chatRateLimitPerMinute,
      dailyTokenCap: config.chatDailyTokenCap,
    },
    reasoning: {
      preset: "reasoning",
      model: config.chatModelReasoning,
      maxOutputTokens: 800,
      maxInputChars: config.chatMaxInputChars,
      rateLimitPerMinute: config.chatRateLimitPerMinute,
      dailyTokenCap: config.chatDailyTokenCap,
    },
  };
}
