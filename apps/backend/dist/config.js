"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRODUCTION_REQUIRED_ENV = void 0;
exports.getConfig = getConfig;
exports.validateProductionBootConfig = validateProductionBootConfig;
exports.assertProductionDatabaseConfigured = assertProductionDatabaseConfigured;
const PRODUCTION_REQUIRED_ENV = [
    "DATABASE_URL",
    "PAIRING_BOOTSTRAP_SECRET",
    "BACKEND_SIGNING_PRIVATE_KEY",
    "BACKEND_SIGNING_AUDIENCE",
    "SIGNATURE_TTL_SECONDS",
    "SIGNATURE_MAX_SKEW_SECONDS",
];
exports.PRODUCTION_REQUIRED_ENV = PRODUCTION_REQUIRED_ENV;
function intFromEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function floatFromEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function getConfig() {
    return {
        port: intFromEnv("PORT", 3001),
        databaseUrl: process.env.DATABASE_URL ?? "",
        supabaseSslRootCertPath: process.env.SUPABASE_SSL_ROOT_CERT_PATH ?? "",
        aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY ?? "",
        aiGatewayBaseUrl: process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1",
        pairingBootstrapSecret: process.env.PAIRING_BOOTSTRAP_SECRET ?? "",
        signatureTtlSeconds: intFromEnv("SIGNATURE_TTL_SECONDS", 180),
        signatureMaxSkewSeconds: intFromEnv("SIGNATURE_MAX_SKEW_SECONDS", 300),
        backendSigningPrivateKey: process.env.BACKEND_SIGNING_PRIVATE_KEY ?? "",
        backendSigningAudience: process.env.BACKEND_SIGNING_AUDIENCE ?? "wp-agent-runtime",
        backendPublicBaseUrl: process.env.BACKEND_PUBLIC_BASE_URL ?? "",
        wpToolApiBase: process.env.WP_TOOL_API_BASE ?? "",
        pairingRateLimitPerMinuteIp: intFromEnv("PAIRING_RATE_LIMIT_PER_MINUTE_IP", 60),
        pairingRateLimitPerMinuteInstallation: intFromEnv("PAIRING_RATE_LIMIT_PER_MINUTE_INSTALLATION", 10),
        chatModelFast: process.env.CHAT_MODEL_FAST ?? "google/gemini-2.5-flash-lite",
        chatModelBalanced: process.env.CHAT_MODEL_BALANCED ?? "anthropic/claude-sonnet-4.5",
        chatModelQuality: process.env.CHAT_MODEL_QUALITY ?? "anthropic/claude-opus-4.6",
        chatModelReasoning: process.env.CHAT_MODEL_REASONING ?? "openai/gpt-5.2",
        chatRateLimitPerMinute: intFromEnv("CHAT_RATE_LIMIT_PER_MINUTE", 20),
        chatDailyTokenCap: intFromEnv("CHAT_DAILY_TOKEN_CAP", 50000),
        chatMaxPromptMessages: intFromEnv("CHAT_MAX_PROMPT_MESSAGES", 12),
        chatMaxInputChars: intFromEnv("CHAT_MAX_INPUT_CHARS", 4000),
        chatSessionRetentionDays: intFromEnv("CHAT_SESSION_RETENTION_DAYS", 30),
        skillSourceRepoUrl: process.env.SKILL_SOURCE_REPO_URL ?? "",
        skillSourceCommitSha: process.env.SKILL_SOURCE_COMMIT_SHA ?? "",
        planMaxSteps: intFromEnv("PLAN_MAX_STEPS", 12),
        planMaxToolCalls: intFromEnv("PLAN_MAX_TOOL_CALLS", 40),
        planMaxPages: intFromEnv("PLAN_MAX_PAGES", 200),
        planMaxCostUsd: floatFromEnv("PLAN_MAX_COST_USD", 5),
        runMaxSteps: intFromEnv("RUN_MAX_STEPS", 12),
        runMaxToolCalls: intFromEnv("RUN_MAX_TOOL_CALLS", 40),
        runMaxPages: intFromEnv("RUN_MAX_PAGES", 200),
        runMaxPagesPerBulk: intFromEnv("RUN_MAX_PAGES_PER_BULK", 50),
        runJobPollIntervalMs: intFromEnv("RUN_JOB_POLL_INTERVAL_MS", 1500),
        runJobPollAttempts: intFromEnv("RUN_JOB_POLL_ATTEMPTS", 60),
        runRecoveryStaleMinutes: intFromEnv("RUN_RECOVERY_STALE_MINUTES", 15),
        runWorkerPollIntervalMs: intFromEnv("RUN_WORKER_POLL_INTERVAL_MS", 1000),
        skillsSyncTimeoutMs: intFromEnv("SKILLS_SYNC_TIMEOUT_MS", 20000),
        skillsSyncMaxDocuments: intFromEnv("SKILLS_SYNC_MAX_DOCUMENTS", 200),
        planDraftLlmTimeoutMs: intFromEnv("PLAN_DRAFT_LLM_TIMEOUT_MS", 25000),
        planDraftManifestTimeoutMs: intFromEnv("PLAN_DRAFT_MANIFEST_TIMEOUT_MS", 10000),
        planDraftMaxOutputChars: intFromEnv("PLAN_DRAFT_MAX_OUTPUT_CHARS", 30000),
    };
}
function validateProductionBootConfig(config) {
    if (process.env.NODE_ENV !== "production") {
        return;
    }
    const missing = PRODUCTION_REQUIRED_ENV.filter((name) => {
        const raw = process.env[name];
        return typeof raw !== "string" || raw.trim().length === 0;
    });
    if (missing.length === 0) {
        return;
    }
    throw new Error(`Fatal config error: missing required production env var(s): ${missing.join(", ")}.`);
}
function assertProductionDatabaseConfigured(config) {
    if (process.env.NODE_ENV === "production" && !config.databaseUrl) {
        throw new Error("Fatal config error: DATABASE_URL is required in production; memory stores are disabled.");
    }
}
