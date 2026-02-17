"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceMessageInputLimit = enforceMessageInputLimit;
exports.enforceDailyBudget = enforceDailyBudget;
exports.enforceRateLimit = enforceRateLimit;
function enforceMessageInputLimit(content, policy) {
    if (content.length <= policy.maxInputChars) {
        return null;
    }
    return {
        statusCode: 400,
        code: "POLICY_INPUT_TOO_LARGE",
        message: `Message exceeds maximum size of ${policy.maxInputChars} characters`,
    };
}
function enforceDailyBudget(usedTokensToday, policy) {
    if (usedTokensToday < policy.dailyTokenCap) {
        return null;
    }
    return {
        statusCode: 429,
        code: "BUDGET_EXCEEDED",
        message: "Daily token cap reached for this installation/user",
    };
}
function enforceRateLimit(options) {
    const result = options.limiter.check(options.key, options.policy.rateLimitPerMinute, 60);
    if (result.allowed) {
        return null;
    }
    return {
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Rate limit exceeded for chat requests",
        retryAfterSeconds: result.retryAfterSeconds,
    };
}
