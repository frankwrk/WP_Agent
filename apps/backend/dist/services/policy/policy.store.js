"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPolicyMap = buildPolicyMap;
const config_1 = require("../../config");
function buildPolicyMap(config = (0, config_1.getConfig)()) {
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
