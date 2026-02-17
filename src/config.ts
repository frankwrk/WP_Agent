export interface AppConfig {
  port: number;
  databaseUrl: string;
  openrouterApiKey: string;
  openrouterBaseUrl: string;
  pairingBootstrapSecret: string;
  signatureTtlSeconds: number;
  signatureMaxSkewSeconds: number;
  backendSigningPrivateKey: string;
  backendSigningAudience: string;
  backendPublicBaseUrl: string;
  wpToolApiBase: string;
  pairingRateLimitPerMinuteIp: number;
  pairingRateLimitPerMinuteInstallation: number;
  chatModelFast: string;
  chatModelBalanced: string;
  chatModelQuality: string;
  chatModelReasoning: string;
  chatRateLimitPerMinute: number;
  chatDailyTokenCap: number;
  chatMaxPromptMessages: number;
  chatMaxInputChars: number;
  chatSessionRetentionDays: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(): AppConfig {
  return {
    port: intFromEnv("PORT", 3001),
    databaseUrl: process.env.DATABASE_URL ?? "",
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
    openrouterBaseUrl:
      process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    pairingBootstrapSecret: process.env.PAIRING_BOOTSTRAP_SECRET ?? "",
    signatureTtlSeconds: intFromEnv("SIGNATURE_TTL_SECONDS", 180),
    signatureMaxSkewSeconds: intFromEnv("SIGNATURE_MAX_SKEW_SECONDS", 300),
    backendSigningPrivateKey: process.env.BACKEND_SIGNING_PRIVATE_KEY ?? "",
    backendSigningAudience:
      process.env.BACKEND_SIGNING_AUDIENCE ?? "wp-agent-runtime",
    backendPublicBaseUrl: process.env.BACKEND_PUBLIC_BASE_URL ?? "",
    wpToolApiBase: process.env.WP_TOOL_API_BASE ?? "",
    pairingRateLimitPerMinuteIp: intFromEnv(
      "PAIRING_RATE_LIMIT_PER_MINUTE_IP",
      60,
    ),
    pairingRateLimitPerMinuteInstallation: intFromEnv(
      "PAIRING_RATE_LIMIT_PER_MINUTE_INSTALLATION",
      10,
    ),
    chatModelFast: process.env.CHAT_MODEL_FAST ?? "gpt-4.1-mini",
    chatModelBalanced: process.env.CHAT_MODEL_BALANCED ?? "gpt-4.1",
    chatModelQuality:
      process.env.CHAT_MODEL_QUALITY ?? "anthropic/claude-sonnet-4",
    chatModelReasoning: process.env.CHAT_MODEL_REASONING ?? "o3",
    chatRateLimitPerMinute: intFromEnv("CHAT_RATE_LIMIT_PER_MINUTE", 20),
    chatDailyTokenCap: intFromEnv("CHAT_DAILY_TOKEN_CAP", 50000),
    chatMaxPromptMessages: intFromEnv("CHAT_MAX_PROMPT_MESSAGES", 12),
    chatMaxInputChars: intFromEnv("CHAT_MAX_INPUT_CHARS", 4000),
    chatSessionRetentionDays: intFromEnv("CHAT_SESSION_RETENTION_DAYS", 30),
  };
}
