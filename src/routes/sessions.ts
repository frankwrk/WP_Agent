import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { assertProductionDatabaseConfigured, getConfig, type AppConfig } from "../config";
import {
  enforceDailyBudget,
  enforceMessageInputLimit,
  enforceRateLimit,
  type PolicyViolation,
} from "../services/policy/enforcement";
import { FixedWindowRateLimiter } from "../services/policy/limiter";
import { buildPolicyMap } from "../services/policy/policy.store";
import { isPolicyPreset, type PolicyPreset } from "../services/policy/policy.schema";
import {
  AiGatewayClient,
  type ChatCompletionMessage,
  type LlmClient,
} from "../services/llm/ai-gateway.client";
import { selectModelForPolicy } from "../services/llm/model.select";
import { parseModelPreference } from "../services/llm/models";
import { getUtcDayStartIso } from "../services/llm/usage.ledger";
import {
  assertRequiredReadTools,
  fetchToolManifest,
  type ToolManifestResponse,
} from "../services/wp/tool.manifest";
import { signedWpGetJson } from "../services/wp/wp.client";

const CHAT_SYSTEM_PROMPT =
  "You are the WP Agent runtime assistant. You are in read-only mode. Use only provided tool context. Do not claim to execute write actions. If context is missing, ask for clarification.";

const chatRateLimiter = new FixedWindowRateLimiter();

export interface ChatSession {
  sessionId: string;
  installationId: string;
  wpUserId: number;
  policyPreset: PolicyPreset;
  contextSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  usageTokens: number;
  createdAt: string;
}

export interface SessionsStore {
  isPairedInstallation(installationId: string): Promise<boolean>;
  findLatestSession(installationId: string, wpUserId: number): Promise<ChatSession | null>;
  createSession(input: {
    installationId: string;
    wpUserId: number;
    policyPreset: PolicyPreset;
    contextSnapshot: Record<string, unknown>;
  }): Promise<ChatSession>;
  getSessionById(sessionId: string): Promise<ChatSession | null>;
  listMessages(sessionId: string, limit: number): Promise<ChatMessage[]>;
  appendMessage(input: {
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    model: string | null;
    usageTokens: number;
  }): Promise<ChatMessage>;
  sumUsageTokensForDay(options: {
    installationId: string;
    wpUserId: number;
    dayStartIso: string;
  }): Promise<number>;
}

export class MemorySessionsStore implements SessionsStore {
  public readonly pairedInstallations = new Set<string>();

  private readonly sessions = new Map<string, ChatSession>();

  private readonly messages = new Map<string, ChatMessage[]>();

  async isPairedInstallation(installationId: string): Promise<boolean> {
    return this.pairedInstallations.has(installationId);
  }

  async findLatestSession(installationId: string, wpUserId: number): Promise<ChatSession | null> {
    const candidates = [...this.sessions.values()].filter(
      (session) =>
        session.installationId === installationId && session.wpUserId === wpUserId,
    );

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return candidates[0] ?? null;
  }

  async createSession(input: {
    installationId: string;
    wpUserId: number;
    policyPreset: PolicyPreset;
    contextSnapshot: Record<string, unknown>;
  }): Promise<ChatSession> {
    const now = new Date().toISOString();
    const session: ChatSession = {
      sessionId: randomUUID(),
      installationId: input.installationId,
      wpUserId: input.wpUserId,
      policyPreset: input.policyPreset,
      contextSnapshot: input.contextSnapshot,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    };

    this.sessions.set(session.sessionId, session);
    this.messages.set(session.sessionId, []);
    return session;
  }

  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async listMessages(sessionId: string, limit: number): Promise<ChatMessage[]> {
    const list = this.messages.get(sessionId) ?? [];
    if (limit <= 0) {
      return [];
    }

    return list.slice(Math.max(0, list.length - limit));
  }

  async appendMessage(input: {
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    model: string | null;
    usageTokens: number;
  }): Promise<ChatMessage> {
    const now = new Date().toISOString();
    const message: ChatMessage = {
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      model: input.model,
      usageTokens: input.usageTokens,
      createdAt: now,
    };

    const list = this.messages.get(input.sessionId) ?? [];
    list.push(message);
    this.messages.set(input.sessionId, list);

    const session = this.sessions.get(input.sessionId);
    if (session) {
      session.lastMessageAt = now;
      session.updatedAt = now;
      this.sessions.set(input.sessionId, session);
    }

    return message;
  }

  async sumUsageTokensForDay(options: {
    installationId: string;
    wpUserId: number;
    dayStartIso: string;
  }): Promise<number> {
    const dayStart = new Date(options.dayStartIso).getTime();
    let total = 0;

    for (const session of this.sessions.values()) {
      if (
        session.installationId !== options.installationId
        || session.wpUserId !== options.wpUserId
      ) {
        continue;
      }

      const list = this.messages.get(session.sessionId) ?? [];
      for (const message of list) {
        if (new Date(message.createdAt).getTime() >= dayStart) {
          total += message.usageTokens;
        }
      }
    }

    return total;
  }
}

class PostgresSessionsStore implements SessionsStore {
  constructor(private readonly pool: Pool) {}

  async isPairedInstallation(installationId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM installations
          WHERE installation_id = $1
            AND status = 'paired'
        ) AS exists
      `,
      [installationId],
    );

    return Boolean(result.rows[0]?.exists);
  }

  async findLatestSession(installationId: string, wpUserId: number): Promise<ChatSession | null> {
    const result = await this.pool.query<{
      session_id: string;
      installation_id: string;
      wp_user_id: number | string;
      policy_preset: PolicyPreset;
      context_snapshot: Record<string, unknown>;
      created_at: string;
      updated_at: string;
      last_message_at: string | null;
    }>(
      `
        SELECT
          session_id,
          installation_id,
          wp_user_id,
          policy_preset,
          context_snapshot,
          created_at,
          updated_at,
          last_message_at
        FROM chat_sessions
        WHERE installation_id = $1
          AND wp_user_id = $2
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [installationId, wpUserId],
    );

    return result.rowCount ? this.mapSession(result.rows[0]) : null;
  }

  async createSession(input: {
    installationId: string;
    wpUserId: number;
    policyPreset: PolicyPreset;
    contextSnapshot: Record<string, unknown>;
  }): Promise<ChatSession> {
    const sessionId = randomUUID();
    const result = await this.pool.query<{
      session_id: string;
      installation_id: string;
      wp_user_id: number | string;
      policy_preset: PolicyPreset;
      context_snapshot: Record<string, unknown>;
      created_at: string;
      updated_at: string;
      last_message_at: string | null;
    }>(
      `
        INSERT INTO chat_sessions (
          session_id,
          installation_id,
          wp_user_id,
          policy_preset,
          context_snapshot
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING
          session_id,
          installation_id,
          wp_user_id,
          policy_preset,
          context_snapshot,
          created_at,
          updated_at,
          last_message_at
      `,
      [
        sessionId,
        input.installationId,
        input.wpUserId,
        input.policyPreset,
        JSON.stringify(input.contextSnapshot),
      ],
    );

    return this.mapSession(result.rows[0]);
  }

  async getSessionById(sessionId: string): Promise<ChatSession | null> {
    const result = await this.pool.query<{
      session_id: string;
      installation_id: string;
      wp_user_id: number | string;
      policy_preset: PolicyPreset;
      context_snapshot: Record<string, unknown>;
      created_at: string;
      updated_at: string;
      last_message_at: string | null;
    }>(
      `
        SELECT
          session_id,
          installation_id,
          wp_user_id,
          policy_preset,
          context_snapshot,
          created_at,
          updated_at,
          last_message_at
        FROM chat_sessions
        WHERE session_id = $1
        LIMIT 1
      `,
      [sessionId],
    );

    return result.rowCount ? this.mapSession(result.rows[0]) : null;
  }

  async listMessages(sessionId: string, limit: number): Promise<ChatMessage[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const result = await this.pool.query<{
      session_id: string;
      role: "user" | "assistant";
      content: string;
      model: string | null;
      usage_tokens: number;
      created_at: string;
    }>(
      `
        SELECT session_id, role, content, model, usage_tokens, created_at
        FROM chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [sessionId, safeLimit],
    );

    return result.rows.map((row) => ({
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      model: row.model,
      usageTokens: row.usage_tokens,
      createdAt: row.created_at,
    }));
  }

  async appendMessage(input: {
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    model: string | null;
    usageTokens: number;
  }): Promise<ChatMessage> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query<{
        session_id: string;
        role: "user" | "assistant";
        content: string;
        model: string | null;
        usage_tokens: number;
        created_at: string;
      }>(
        `
          INSERT INTO chat_messages (
            session_id,
            role,
            content,
            model,
            usage_tokens
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING session_id, role, content, model, usage_tokens, created_at
        `,
        [
          input.sessionId,
          input.role,
          input.content,
          input.model,
          input.usageTokens,
        ],
      );

      await client.query(
        `
          UPDATE chat_sessions
          SET updated_at = NOW(), last_message_at = NOW()
          WHERE session_id = $1
        `,
        [input.sessionId],
      );

      await client.query("COMMIT");

      const row = result.rows[0];
      return {
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        model: row.model,
        usageTokens: row.usage_tokens,
        createdAt: row.created_at,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async sumUsageTokensForDay(options: {
    installationId: string;
    wpUserId: number;
    dayStartIso: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string | null }>(
      `
        SELECT COALESCE(SUM(m.usage_tokens), 0)::text AS total
        FROM chat_messages m
        JOIN chat_sessions s
          ON s.session_id = m.session_id
        WHERE s.installation_id = $1
          AND s.wp_user_id = $2
          AND m.created_at >= $3::timestamptz
      `,
      [options.installationId, options.wpUserId, options.dayStartIso],
    );

    return Number.parseInt(result.rows[0]?.total ?? "0", 10) || 0;
  }

  private mapSession(row: {
    session_id: string;
    installation_id: string;
    wp_user_id: number | string;
    policy_preset: PolicyPreset;
    context_snapshot: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    last_message_at: string | null;
  }): ChatSession {
    const wpUserId =
      typeof row.wp_user_id === "number"
        ? row.wp_user_id
        : Number.parseInt(String(row.wp_user_id), 10);

    if (!Number.isFinite(wpUserId) || wpUserId <= 0) {
      throw new Error("Invalid wp_user_id in chat_sessions row");
    }

    return {
      sessionId: row.session_id,
      installationId: row.installation_id,
      wpUserId,
      policyPreset: row.policy_preset,
      contextSnapshot: row.context_snapshot,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at,
    };
  }
}

interface WpToolEnvelope {
  ok: boolean;
  data: unknown;
  error?: unknown;
}

export interface SessionContextLoader {
  load(installationId: string): Promise<Record<string, unknown>>;
}

class WpSessionContextLoader implements SessionContextLoader {
  constructor(private readonly config: AppConfig) {}

  async load(installationId: string): Promise<Record<string, unknown>> {
    const manifest = await fetchToolManifest(installationId, this.config.wpToolApiBase);
    assertRequiredReadTools(manifest);

    const baseUrl = this.config.wpToolApiBase.replace(/\/$/, "");

    const [siteEnvironmentRaw, contentInventoryRaw, seoConfigRaw] = await Promise.all([
      signedWpGetJson<WpToolEnvelope>({
        installationId,
        url: `${baseUrl}/site/environment`,
      }),
      signedWpGetJson<WpToolEnvelope>({
        installationId,
        url: `${baseUrl}/content/inventory`,
        query: {
          post_types: "post,page",
          page: 1,
          per_page: 20,
        },
      }),
      signedWpGetJson<WpToolEnvelope>({
        installationId,
        url: `${baseUrl}/seo/config`,
      }),
    ]);

    return {
      fetched_at: new Date().toISOString(),
      manifest: toManifestSummary(manifest),
      site_environment: unwrapToolResponse(siteEnvironmentRaw, "site.get_environment"),
      content_inventory: unwrapToolResponse(contentInventoryRaw, "content.inventory"),
      seo_config: unwrapToolResponse(seoConfigRaw, "seo.get_config"),
    };
  }
}

function toManifestSummary(manifest: ToolManifestResponse): Record<string, unknown> {
  return {
    tools: manifest.data.tools.map((tool) => ({
      name: tool.name,
      endpoint: tool.endpoint,
      method: tool.method,
      readOnly: tool.readOnly,
    })),
    auth: manifest.data.auth ?? {},
  };
}

function unwrapToolResponse(response: WpToolEnvelope, toolName: string): unknown {
  if (!response.ok) {
    throw new Error(`WP tool response failed for ${toolName}`);
  }

  return response.data;
}

export interface SessionsRouteOptions {
  store?: SessionsStore;
  llmClient?: LlmClient;
  contextLoader?: SessionContextLoader;
  config?: AppConfig;
}

let cachedPool: Pool | null = null;

function createStore(config: AppConfig): SessionsStore {
  assertProductionDatabaseConfigured(config);
  if (!config.databaseUrl) {
    return new MemorySessionsStore();
  }

  if (!cachedPool) {
    cachedPool = new Pool({ connectionString: config.databaseUrl });
  }

  return new PostgresSessionsStore(cachedPool);
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function errorResponse(code: string, message: string, details?: Record<string, unknown>) {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      ...(details ?? {}),
    },
    meta: null,
  };
}

function validateSessionCreatePayload(raw: unknown): {
  value?: {
    policyPreset: PolicyPreset;
  };
  error?: string;
} {
  if (!raw || typeof raw !== "object") {
    return { error: "Payload must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
  const preset = String(body.policy_preset ?? "balanced").trim().toLowerCase();

  if (!isPolicyPreset(preset)) {
    return { error: "policy_preset must be one of fast, balanced, quality, reasoning" };
  }

  return {
    value: {
      policyPreset: preset,
    },
  };
}

function validateSessionMessagePayload(raw: unknown): {
  value?: {
    content: string;
    modelPreference: ReturnType<typeof parseModelPreference>;
  };
  error?: string;
} {
  if (!raw || typeof raw !== "object") {
    return { error: "Payload must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
  const content = String(body.content ?? "").trim();
  const modelPreference = parseModelPreference(body.model_preference);

  if (!content) {
    return { error: "content is required" };
  }

  return {
    value: {
      content,
      modelPreference,
    },
  };
}

function getRequestScope(request: { installationId?: string; wpUserId?: number }): {
  value?: { installationId: string; wpUserId: number };
  error?: string;
} {
  const installationId = request.installationId;
  const wpUserId = request.wpUserId;

  if (!installationId || !isValidUuid(installationId)) {
    return { error: "installation_id must be a valid UUID" };
  }

  if (typeof wpUserId !== "number" || !Number.isInteger(wpUserId) || wpUserId <= 0) {
    return { error: "wp_user_id must be a positive integer" };
  }

  return { value: { installationId, wpUserId } };
}

function parsePreferenceHeader(rawHeader: string | string[] | undefined) {
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  return parseModelPreference(value);
}

function toPolicyViolationResponse(violation: PolicyViolation) {
  return errorResponse(violation.code, violation.message, {
    retry_after: violation.retryAfterSeconds,
  });
}

function toApiSession(session: ChatSession): Record<string, unknown> {
  return {
    session_id: session.sessionId,
    installation_id: session.installationId,
    wp_user_id: session.wpUserId,
    policy_preset: session.policyPreset,
    context_snapshot: session.contextSnapshot,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    last_message_at: session.lastMessageAt,
  };
}

function toApiMessage(message: ChatMessage): Record<string, unknown> {
  return {
    session_id: message.sessionId,
    role: message.role,
    content: message.content,
    model: message.model,
    usage_tokens: message.usageTokens,
    created_at: message.createdAt,
  };
}

function buildPromptMessages(options: {
  contextSnapshot: Record<string, unknown>;
  history: ChatMessage[];
  userMessage: string;
}): ChatCompletionMessage[] {
  const prompt: ChatCompletionMessage[] = [
    {
      role: "system",
      content: CHAT_SYSTEM_PROMPT,
    },
    {
      role: "system",
      content: `WordPress context snapshot JSON:\n${JSON.stringify(options.contextSnapshot)}`,
    },
  ];

  for (const message of options.history) {
    prompt.push({
      role: message.role,
      content: message.content,
    });
  }

  prompt.push({
    role: "user",
    content: options.userMessage,
  });

  return prompt;
}

export async function sessionsRoutes(app: FastifyInstance, options: SessionsRouteOptions) {
  const config = options.config ?? getConfig();
  const store = options.store ?? createStore(config);
  const llmClient = options.llmClient ?? new AiGatewayClient();
  const contextLoader = options.contextLoader ?? new WpSessionContextLoader(config);
  const policyMap = buildPolicyMap(config);
  app.post("/sessions", async (request, reply) => {

    const scope = getRequestScope(request);
    if (!scope.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
    }

    const validated = validateSessionCreatePayload(request.body);
    if (!validated.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", validated.error ?? "Invalid payload"));
    }

    const { installationId, wpUserId } = scope.value;
    const { policyPreset } = validated.value;

    const paired = await store.isPairedInstallation(installationId);
    if (!paired) {
      return reply
        .code(404)
        .send(
          errorResponse(
            "INSTALLATION_NOT_PAIRED",
            "Installation must be paired before creating chat sessions",
          ),
        );
    }

    const existing = await store.findLatestSession(installationId, wpUserId);
    if (existing) {
      const messages = await store.listMessages(existing.sessionId, config.chatMaxPromptMessages * 2);
      return reply.code(200).send({
        ok: true,
        data: {
          session: toApiSession(existing),
          messages: messages.map((message) => toApiMessage(message)),
          resumed: true,
        },
        error: null,
        meta: null,
      });
    }

    let contextSnapshot: Record<string, unknown>;
    try {
      contextSnapshot = await contextLoader.load(installationId);
    } catch (error) {
      request.log.error({ error }, "failed to load WP context for session creation");
      return reply
        .code(502)
        .send(errorResponse("WP_CONTEXT_FETCH_FAILED", "Unable to fetch required WP tool context"));
    }

    const session = await store.createSession({
      installationId,
      wpUserId,
      policyPreset,
      contextSnapshot,
    });

    return reply.code(200).send({
      ok: true,
      data: {
        session: toApiSession(session),
        messages: [],
        resumed: false,
      },
      error: null,
      meta: null,
    });
  });

  app.get("/sessions/:sessionId", async (request, reply) => {

    const sessionId = String((request.params as { sessionId?: string }).sessionId ?? "").trim();

    if (!sessionId || !isValidUuid(sessionId)) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", "sessionId must be a valid UUID"));
    }

    const scope = getRequestScope(request);
    if (!scope.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
    }

    const session = await store.getSessionById(sessionId);
    if (!session) {
      return reply.code(404).send(errorResponse("SESSION_NOT_FOUND", "Session not found"));
    }

    if (
      session.installationId !== scope.value.installationId
      || session.wpUserId !== scope.value.wpUserId
    ) {
      return reply
        .code(403)
        .send(errorResponse("SESSION_SCOPE_VIOLATION", "Session does not belong to caller scope"));
    }

    const messages = await store.listMessages(sessionId, config.chatMaxPromptMessages * 2);
    return reply.code(200).send({
      ok: true,
      data: {
        session: toApiSession(session),
        messages: messages.map((message) => toApiMessage(message)),
      },
      error: null,
      meta: null,
    });
  });

  app.post("/sessions/:sessionId/messages", async (request, reply) => {

    const sessionId = String((request.params as { sessionId?: string }).sessionId ?? "").trim();
    if (!sessionId || !isValidUuid(sessionId)) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", "sessionId must be a valid UUID"));
    }

    const scope = getRequestScope(request);
    if (!scope.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
    }

    const validated = validateSessionMessagePayload(request.body);
    if (!validated.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", validated.error ?? "Invalid payload"));
    }

    const session = await store.getSessionById(sessionId);
    if (!session) {
      return reply.code(404).send(errorResponse("SESSION_NOT_FOUND", "Session not found"));
    }

    if (session.installationId !== scope.value.installationId || session.wpUserId !== scope.value.wpUserId) {
      return reply
        .code(403)
        .send(errorResponse("SESSION_SCOPE_VIOLATION", "Session does not belong to caller scope"));
    }

    const policy = policyMap[session.policyPreset];

    const rateLimitViolation = enforceRateLimit({
      limiter: chatRateLimiter,
      key: `${session.installationId}:${session.wpUserId}`,
      policy,
    });

    if (rateLimitViolation) {
      return reply
        .code(rateLimitViolation.statusCode)
        .send(toPolicyViolationResponse(rateLimitViolation));
    }

    const inputViolation = enforceMessageInputLimit(validated.value.content, policy);
    if (inputViolation) {
      return reply.code(inputViolation.statusCode).send(toPolicyViolationResponse(inputViolation));
    }

    const usedTokensToday = await store.sumUsageTokensForDay({
      installationId: session.installationId,
      wpUserId: session.wpUserId,
      dayStartIso: getUtcDayStartIso(),
    });

    const dailyBudgetViolation = enforceDailyBudget(usedTokensToday, policy);
    if (dailyBudgetViolation) {
      return reply
        .code(dailyBudgetViolation.statusCode)
        .send(toPolicyViolationResponse(dailyBudgetViolation));
    }

    const history = await store.listMessages(sessionId, config.chatMaxPromptMessages * 2);
    const selectedModel = selectModelForPolicy({
      policy,
      explicitPreference:
        validated.value.modelPreference
        ?? parsePreferenceHeader(request.headers["x-wp-agent-model-preference"]),
      routeDefaultPreference: "balanced",
    });

    const llmRequestId = randomUUID();

    request.log.info(
      {
        requestId: request.id,
        llmRequestId,
        taskClass: selectedModel.taskClass,
        preference: selectedModel.preference,
        selectedModel: selectedModel.model,
        routingReason: selectedModel.routingReason,
      },
      "llm model selected",
    );

    let completion: {
      content: string;
      model: string;
      usageTokens: number;
      providerRequestId?: string;
    };

    try {
      completion = await llmClient.completeChat({
        requestId: llmRequestId,
        model: selectedModel.model,
        maxTokens: policy.maxOutputTokens,
        messages: buildPromptMessages({
          contextSnapshot: session.contextSnapshot,
          history,
          userMessage: validated.value.content,
        }),
      });

      request.log.info(
        {
          requestId: request.id,
          llmRequestId,
          providerRequestId: completion.providerRequestId,
          taskClass: selectedModel.taskClass,
          preference: selectedModel.preference,
          selectedModel: completion.model,
          routingReason: selectedModel.routingReason,
        },
        "llm request completed",
      );
    } catch (error) {
      request.log.error({ error, requestId: request.id, llmRequestId }, "chat completion failed");
      return reply
        .code(502)
        .send(errorResponse("LLM_UPSTREAM_ERROR", "LLM provider request failed"));
    }

    const userMessage = await store.appendMessage({
      sessionId,
      role: "user",
      content: validated.value.content,
      model: null,
      usageTokens: 0,
    });

    const assistantMessage = await store.appendMessage({
      sessionId,
      role: "assistant",
      content: completion.content,
      model: completion.model,
      usageTokens: completion.usageTokens,
    });

    const updatedSession = await store.getSessionById(sessionId);

    return reply.code(200).send({
      ok: true,
      data: {
        session: updatedSession ? toApiSession(updatedSession) : null,
        user_message: toApiMessage(userMessage),
        assistant_message: toApiMessage(assistantMessage),
      },
      error: null,
      meta: {
        model: completion.model,
        used_tokens_today: usedTokensToday + completion.usageTokens,
        llm_request_id: llmRequestId,
        provider_request_id: completion.providerRequestId,
        routing_reason: selectedModel.routingReason,
      },
    });
  });
}
