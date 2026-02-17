"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemorySessionsStore = void 0;
exports.sessionsRoutes = sessionsRoutes;
const node_crypto_1 = require("node:crypto");
const pg_1 = require("pg");
const config_1 = require("../config");
const enforcement_1 = require("../services/policy/enforcement");
const limiter_1 = require("../services/policy/limiter");
const policy_store_1 = require("../services/policy/policy.store");
const policy_schema_1 = require("../services/policy/policy.schema");
const ai_gateway_client_1 = require("../services/llm/ai-gateway.client");
const model_select_1 = require("../services/llm/model.select");
const models_1 = require("../services/llm/models");
const usage_ledger_1 = require("../services/llm/usage.ledger");
const tool_manifest_1 = require("../services/wp/tool.manifest");
const wp_client_1 = require("../services/wp/wp.client");
const CHAT_SYSTEM_PROMPT = "You are the WP Agent runtime assistant. You are in read-only mode. Use only provided tool context. Do not claim to execute write actions. If context is missing, ask for clarification.";
const chatRateLimiter = new limiter_1.FixedWindowRateLimiter();
class MemorySessionsStore {
    pairedInstallations = new Set();
    sessions = new Map();
    messages = new Map();
    async isPairedInstallation(installationId) {
        return this.pairedInstallations.has(installationId);
    }
    async findLatestSession(installationId, wpUserId) {
        const candidates = [...this.sessions.values()].filter((session) => session.installationId === installationId && session.wpUserId === wpUserId);
        if (candidates.length === 0) {
            return null;
        }
        candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return candidates[0] ?? null;
    }
    async createSession(input) {
        const now = new Date().toISOString();
        const session = {
            sessionId: (0, node_crypto_1.randomUUID)(),
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
    async getSessionById(sessionId) {
        return this.sessions.get(sessionId) ?? null;
    }
    async listMessages(sessionId, limit) {
        const list = this.messages.get(sessionId) ?? [];
        if (limit <= 0) {
            return [];
        }
        return list.slice(Math.max(0, list.length - limit));
    }
    async appendMessage(input) {
        const now = new Date().toISOString();
        const message = {
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
    async sumUsageTokensForDay(options) {
        const dayStart = new Date(options.dayStartIso).getTime();
        let total = 0;
        for (const session of this.sessions.values()) {
            if (session.installationId !== options.installationId
                || session.wpUserId !== options.wpUserId) {
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
exports.MemorySessionsStore = MemorySessionsStore;
class PostgresSessionsStore {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async isPairedInstallation(installationId) {
        const result = await this.pool.query(`
        SELECT EXISTS(
          SELECT 1
          FROM installations
          WHERE installation_id = $1
            AND status = 'paired'
        ) AS exists
      `, [installationId]);
        return Boolean(result.rows[0]?.exists);
    }
    async findLatestSession(installationId, wpUserId) {
        const result = await this.pool.query(`
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
      `, [installationId, wpUserId]);
        return result.rowCount ? this.mapSession(result.rows[0]) : null;
    }
    async createSession(input) {
        const sessionId = (0, node_crypto_1.randomUUID)();
        const result = await this.pool.query(`
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
      `, [
            sessionId,
            input.installationId,
            input.wpUserId,
            input.policyPreset,
            JSON.stringify(input.contextSnapshot),
        ]);
        return this.mapSession(result.rows[0]);
    }
    async getSessionById(sessionId) {
        const result = await this.pool.query(`
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
      `, [sessionId]);
        return result.rowCount ? this.mapSession(result.rows[0]) : null;
    }
    async listMessages(sessionId, limit) {
        const safeLimit = Math.max(1, Math.min(limit, 100));
        const result = await this.pool.query(`
        SELECT session_id, role, content, model, usage_tokens, created_at
        FROM chat_messages
        WHERE session_id = $1
        ORDER BY created_at ASC
        LIMIT $2
      `, [sessionId, safeLimit]);
        return result.rows.map((row) => ({
            sessionId: row.session_id,
            role: row.role,
            content: row.content,
            model: row.model,
            usageTokens: row.usage_tokens,
            createdAt: row.created_at,
        }));
    }
    async appendMessage(input) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(`
          INSERT INTO chat_messages (
            session_id,
            role,
            content,
            model,
            usage_tokens
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING session_id, role, content, model, usage_tokens, created_at
        `, [
                input.sessionId,
                input.role,
                input.content,
                input.model,
                input.usageTokens,
            ]);
            await client.query(`
          UPDATE chat_sessions
          SET updated_at = NOW(), last_message_at = NOW()
          WHERE session_id = $1
        `, [input.sessionId]);
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
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async sumUsageTokensForDay(options) {
        const result = await this.pool.query(`
        SELECT COALESCE(SUM(m.usage_tokens), 0)::text AS total
        FROM chat_messages m
        JOIN chat_sessions s
          ON s.session_id = m.session_id
        WHERE s.installation_id = $1
          AND s.wp_user_id = $2
          AND m.created_at >= $3::timestamptz
      `, [options.installationId, options.wpUserId, options.dayStartIso]);
        return Number.parseInt(result.rows[0]?.total ?? "0", 10) || 0;
    }
    mapSession(row) {
        const wpUserId = typeof row.wp_user_id === "number"
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
class WpSessionContextLoader {
    config;
    constructor(config) {
        this.config = config;
    }
    async load(installationId) {
        const manifest = await (0, tool_manifest_1.fetchToolManifest)(installationId, this.config.wpToolApiBase);
        (0, tool_manifest_1.assertRequiredReadTools)(manifest);
        const baseUrl = this.config.wpToolApiBase.replace(/\/$/, "");
        const [siteEnvironmentRaw, contentInventoryRaw, seoConfigRaw] = await Promise.all([
            (0, wp_client_1.signedWpGetJson)({
                installationId,
                url: `${baseUrl}/site/environment`,
            }),
            (0, wp_client_1.signedWpGetJson)({
                installationId,
                url: `${baseUrl}/content/inventory`,
                query: {
                    post_types: "post,page",
                    page: 1,
                    per_page: 20,
                },
            }),
            (0, wp_client_1.signedWpGetJson)({
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
function toManifestSummary(manifest) {
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
function unwrapToolResponse(response, toolName) {
    if (!response.ok) {
        throw new Error(`WP tool response failed for ${toolName}`);
    }
    return response.data;
}
let cachedPool = null;
function createStore(config) {
    if (!config.databaseUrl) {
        return new MemorySessionsStore();
    }
    if (!cachedPool) {
        cachedPool = new pg_1.Pool({ connectionString: config.databaseUrl });
    }
    return new PostgresSessionsStore(cachedPool);
}
function constantTimeEqual(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(left, right);
}
function isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function errorResponse(code, message, details) {
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
function validateSessionCreatePayload(raw) {
    if (!raw || typeof raw !== "object") {
        return { error: "Payload must be a JSON object" };
    }
    const body = raw;
    const installationId = String(body.installation_id ?? "").trim();
    const wpUserId = Number.parseInt(String(body.wp_user_id ?? ""), 10);
    const preset = String(body.policy_preset ?? "balanced").trim().toLowerCase();
    if (!isValidUuid(installationId)) {
        return { error: "installation_id must be a valid UUID" };
    }
    if (!Number.isInteger(wpUserId) || wpUserId <= 0) {
        return { error: "wp_user_id must be a positive integer" };
    }
    if (!(0, policy_schema_1.isPolicyPreset)(preset)) {
        return { error: "policy_preset must be one of fast, balanced, quality, reasoning" };
    }
    return {
        value: {
            installationId,
            wpUserId,
            policyPreset: preset,
        },
    };
}
function validateSessionMessagePayload(raw) {
    if (!raw || typeof raw !== "object") {
        return { error: "Payload must be a JSON object" };
    }
    const body = raw;
    const installationId = String(body.installation_id ?? "").trim();
    const wpUserId = Number.parseInt(String(body.wp_user_id ?? ""), 10);
    const content = String(body.content ?? "").trim();
    const modelPreference = (0, models_1.parseModelPreference)(body.model_preference);
    if (!isValidUuid(installationId)) {
        return { error: "installation_id must be a valid UUID" };
    }
    if (!Number.isInteger(wpUserId) || wpUserId <= 0) {
        return { error: "wp_user_id must be a positive integer" };
    }
    if (!content) {
        return { error: "content is required" };
    }
    return {
        value: {
            installationId,
            wpUserId,
            content,
            modelPreference,
        },
    };
}
function parsePreferenceHeader(rawHeader) {
    const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    return (0, models_1.parseModelPreference)(value);
}
function validateBootstrapHeader(rawHeader, config) {
    if (!config.pairingBootstrapSecret) {
        return false;
    }
    const header = Array.isArray(rawHeader) ? rawHeader[0] ?? "" : String(rawHeader ?? "");
    if (!header) {
        return false;
    }
    return constantTimeEqual(header, config.pairingBootstrapSecret);
}
function toPolicyViolationResponse(violation) {
    return errorResponse(violation.code, violation.message, {
        retry_after: violation.retryAfterSeconds,
    });
}
function toApiSession(session) {
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
function toApiMessage(message) {
    return {
        session_id: message.sessionId,
        role: message.role,
        content: message.content,
        model: message.model,
        usage_tokens: message.usageTokens,
        created_at: message.createdAt,
    };
}
function buildPromptMessages(options) {
    const prompt = [
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
async function sessionsRoutes(app, options) {
    const config = options.config ?? (0, config_1.getConfig)();
    const store = options.store ?? createStore(config);
    const llmClient = options.llmClient ?? new ai_gateway_client_1.AiGatewayClient();
    const contextLoader = options.contextLoader ?? new WpSessionContextLoader(config);
    const policyMap = (0, policy_store_1.buildPolicyMap)(config);
    app.post("/sessions", async (request, reply) => {
        if (!validateBootstrapHeader(request.headers["x-wp-agent-bootstrap"], config)) {
            return reply
                .code(401)
                .send(errorResponse("SESSION_AUTH_FAILED", "Invalid bootstrap authentication header"));
        }
        const validated = validateSessionCreatePayload(request.body);
        if (!validated.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", validated.error ?? "Invalid payload"));
        }
        const { installationId, wpUserId, policyPreset } = validated.value;
        const paired = await store.isPairedInstallation(installationId);
        if (!paired) {
            return reply
                .code(404)
                .send(errorResponse("INSTALLATION_NOT_PAIRED", "Installation must be paired before creating chat sessions"));
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
        let contextSnapshot;
        try {
            contextSnapshot = await contextLoader.load(installationId);
        }
        catch (error) {
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
        if (!validateBootstrapHeader(request.headers["x-wp-agent-bootstrap"], config)) {
            return reply
                .code(401)
                .send(errorResponse("SESSION_AUTH_FAILED", "Invalid bootstrap authentication header"));
        }
        const sessionId = String(request.params.sessionId ?? "").trim();
        const installationId = String(request.query?.installation_id ?? "").trim();
        const wpUserId = Number.parseInt(String(request.query?.wp_user_id ?? ""), 10);
        if (!sessionId || !isValidUuid(sessionId)) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", "sessionId must be a valid UUID"));
        }
        if (!isValidUuid(installationId) || !Number.isInteger(wpUserId) || wpUserId <= 0) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", "installation_id and wp_user_id are required"));
        }
        const session = await store.getSessionById(sessionId);
        if (!session) {
            return reply.code(404).send(errorResponse("SESSION_NOT_FOUND", "Session not found"));
        }
        if (session.installationId !== installationId || session.wpUserId !== wpUserId) {
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
        if (!validateBootstrapHeader(request.headers["x-wp-agent-bootstrap"], config)) {
            return reply
                .code(401)
                .send(errorResponse("SESSION_AUTH_FAILED", "Invalid bootstrap authentication header"));
        }
        const sessionId = String(request.params.sessionId ?? "").trim();
        if (!sessionId || !isValidUuid(sessionId)) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", "sessionId must be a valid UUID"));
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
        if (session.installationId !== validated.value.installationId
            || session.wpUserId !== validated.value.wpUserId) {
            return reply
                .code(403)
                .send(errorResponse("SESSION_SCOPE_VIOLATION", "Session does not belong to caller scope"));
        }
        const policy = policyMap[session.policyPreset];
        const rateLimitViolation = (0, enforcement_1.enforceRateLimit)({
            limiter: chatRateLimiter,
            key: `${session.installationId}:${session.wpUserId}`,
            policy,
        });
        if (rateLimitViolation) {
            return reply
                .code(rateLimitViolation.statusCode)
                .send(toPolicyViolationResponse(rateLimitViolation));
        }
        const inputViolation = (0, enforcement_1.enforceMessageInputLimit)(validated.value.content, policy);
        if (inputViolation) {
            return reply.code(inputViolation.statusCode).send(toPolicyViolationResponse(inputViolation));
        }
        const usedTokensToday = await store.sumUsageTokensForDay({
            installationId: session.installationId,
            wpUserId: session.wpUserId,
            dayStartIso: (0, usage_ledger_1.getUtcDayStartIso)(),
        });
        const dailyBudgetViolation = (0, enforcement_1.enforceDailyBudget)(usedTokensToday, policy);
        if (dailyBudgetViolation) {
            return reply
                .code(dailyBudgetViolation.statusCode)
                .send(toPolicyViolationResponse(dailyBudgetViolation));
        }
        const history = await store.listMessages(sessionId, config.chatMaxPromptMessages * 2);
        const selectedModel = (0, model_select_1.selectModelForPolicy)({
            policy,
            explicitPreference: validated.value.modelPreference
                ?? parsePreferenceHeader(request.headers["x-wp-agent-model-preference"]),
            routeDefaultPreference: "balanced",
        });
        const llmRequestId = (0, node_crypto_1.randomUUID)();
        request.log.info({
            requestId: request.id,
            llmRequestId,
            taskClass: selectedModel.taskClass,
            preference: selectedModel.preference,
            selectedModel: selectedModel.model,
            routingReason: selectedModel.routingReason,
        }, "llm model selected");
        let completion;
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
            request.log.info({
                requestId: request.id,
                llmRequestId,
                providerRequestId: completion.providerRequestId,
                taskClass: selectedModel.taskClass,
                preference: selectedModel.preference,
                selectedModel: completion.model,
                routingReason: selectedModel.routingReason,
            }, "llm request completed");
        }
        catch (error) {
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
