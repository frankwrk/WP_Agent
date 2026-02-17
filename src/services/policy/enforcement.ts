import type { ChatPolicy } from "./policy.schema";
import type { FixedWindowRateLimiter } from "./limiter";

export interface PolicyViolation {
  statusCode: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export function enforceMessageInputLimit(
  content: string,
  policy: ChatPolicy,
): PolicyViolation | null {
  if (content.length <= policy.maxInputChars) {
    return null;
  }

  return {
    statusCode: 400,
    code: "POLICY_INPUT_TOO_LARGE",
    message: `Message exceeds maximum size of ${policy.maxInputChars} characters`,
  };
}

export function enforceDailyBudget(
  usedTokensToday: number,
  policy: ChatPolicy,
): PolicyViolation | null {
  if (usedTokensToday < policy.dailyTokenCap) {
    return null;
  }

  return {
    statusCode: 429,
    code: "BUDGET_EXCEEDED",
    message: "Daily token cap reached for this installation/user",
  };
}

export function enforceRateLimit(options: {
  limiter: FixedWindowRateLimiter;
  key: string;
  policy: ChatPolicy;
}): PolicyViolation | null {
  const result = options.limiter.check(
    options.key,
    options.policy.rateLimitPerMinute,
    60,
  );

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
