"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runsRoutes = runsRoutes;
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
const plan_contract_1 = require("../services/plans/plan.contract");
const estimate_1 = require("../services/plans/estimate");
const plan_parse_1 = require("../services/plans/plan.parse");
const plan_validate_1 = require("../services/plans/plan.validate");
const tool_registry_1 = require("../services/plans/tool.registry");
const store_1 = require("../services/plans/store");
const store_2 = require("../services/skills/store");
const store_3 = require("../services/runs/store");
const executor_1 = require("../services/runs/executor");
const recovery_1 = require("../services/runs/recovery");
const worker_1 = require("../services/runs/worker");
const input_mapper_1 = require("../services/runs/input.mapper");
const tool_manifest_1 = require("../services/wp/tool.manifest");
const planner_prompt_1 = require("../services/plans/planner.prompt");
const planRateLimiter = new limiter_1.FixedWindowRateLimiter();
let cachedPool = null;
function getPool(config) {
    if (!config.databaseUrl) {
        return null;
    }
    if (!cachedPool) {
        cachedPool = new pg_1.Pool({ connectionString: config.databaseUrl });
    }
    return cachedPool;
}
function createPlanStore(config) {
    (0, config_1.assertProductionDatabaseConfigured)(config);
    const pool = getPool(config);
    if (!pool) {
        return new store_1.MemoryPlanStore();
    }
    return new store_1.PostgresPlanStore(pool);
}
function createSkillStore(config) {
    (0, config_1.assertProductionDatabaseConfigured)(config);
    const pool = getPool(config);
    if (!pool) {
        return new store_2.MemorySkillStore();
    }
    return new store_2.PostgresSkillStore(pool);
}
function createRunStore(config) {
    (0, config_1.assertProductionDatabaseConfigured)(config);
    const pool = getPool(config);
    if (!pool) {
        return new store_3.MemoryRunStore();
    }
    return new store_3.PostgresRunStore(pool);
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
function toPolicyViolationResponse(violation) {
    return errorResponse(violation.code, violation.message, {
        retry_after: violation.retryAfterSeconds,
    });
}
function toApiEvent(event) {
    return {
        id: event.id,
        plan_id: event.planId,
        event_type: event.eventType,
        actor_type: event.actorType,
        actor_id: event.actorId,
        payload: event.payload,
        created_at: event.createdAt,
    };
}
function mapPlanRecordToContract(record) {
    return {
        planVersion: 1,
        planId: record.planId,
        planHash: record.planHash,
        skillId: record.skillId,
        goal: record.goal,
        assumptions: record.assumptions,
        inputs: record.inputs,
        steps: record.steps,
        estimates: record.estimates,
        risk: record.risk,
        validationIssues: record.validationIssues,
        policyContext: record.policyContext,
        llm: record.llm,
        status: record.status,
        llmUsageTokens: record.llmUsageTokens,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
function toApiRun(record) {
    return {
        run_id: record.runId,
        installation_id: record.installationId,
        wp_user_id: record.wpUserId,
        plan_id: record.planId,
        status: record.status,
        planned_steps: record.plannedSteps,
        planned_tool_calls: record.plannedToolCalls,
        planned_pages: record.plannedPages,
        actual_tool_calls: record.actualToolCalls,
        actual_pages: record.actualPages,
        error_code: record.errorCode,
        error_message: record.errorMessage,
        rollback_available: record.rollbackAvailable,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        started_at: record.startedAt,
        finished_at: record.finishedAt,
    };
}
function parseRunCreatePayload(raw) {
    if (!raw || typeof raw !== "object") {
        return { error: "Payload must be a JSON object" };
    }
    const body = raw;
    const planId = String(body.plan_id ?? "").trim();
    if (!isValidUuid(planId)) {
        return { error: "plan_id must be a valid UUID" };
    }
    return {
        value: {
            planId,
        },
    };
}
function parseDraftPayload(raw) {
    if (!raw || typeof raw !== "object") {
        return { error: "Payload must be a JSON object" };
    }
    const body = raw;
    const policyPreset = String(body.policy_preset ?? "balanced").trim().toLowerCase();
    const modelPreference = (0, models_1.parseModelPreference)(body.model_preference);
    const skillId = String(body.skill_id ?? "").trim();
    const goal = String(body.goal ?? "").trim();
    const inputs = body.inputs;
    if (!(0, policy_schema_1.isPolicyPreset)(policyPreset)) {
        return { error: "policy_preset must be one of fast, balanced, quality, reasoning" };
    }
    if (!skillId) {
        return { error: "skill_id is required" };
    }
    if (!goal) {
        return { error: "goal is required" };
    }
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
        return { error: "inputs must be an object" };
    }
    return {
        value: {
            policyPreset,
            modelPreference,
            skillId,
            goal,
            inputs: inputs,
        },
    };
}
function getRequestScope(request) {
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
function parsePreferenceHeader(rawHeader) {
    const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    return (0, models_1.parseModelPreference)(value);
}
async function withTimeout(factory, timeoutMs, timeoutMessage) {
    let timer = null;
    try {
        return await Promise.race([
            factory(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(timeoutMessage));
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
async function defaultManifestToolLoader(installationId, config) {
    const manifest = await (0, tool_manifest_1.fetchToolManifest)(installationId, config.wpToolApiBase);
    return new Set(manifest.data.tools.map((tool) => tool.name));
}
async function runsRoutes(app, options = {}) {
    const config = options.config ?? (0, config_1.getConfig)();
    const planStore = options.planStore ?? createPlanStore(config);
    const skillStore = options.skillStore ?? createSkillStore(config);
    const runStore = options.runStore ?? createRunStore(config);
    const llmClient = options.llmClient ?? new ai_gateway_client_1.AiGatewayClient();
    const manifestToolsLoader = options.manifestToolsLoader
        ? options.manifestToolsLoader
        : (installationId) => defaultManifestToolLoader(installationId, config);
    const runExecutor = options.runExecutor ?? new executor_1.RunExecutor({
        runStore,
        wpToolApiBase: config.wpToolApiBase,
        jobPollIntervalMs: Math.max(100, config.runJobPollIntervalMs),
        jobPollAttempts: Math.max(1, config.runJobPollAttempts),
        logger: app.log,
    });
    const canRecover = !options.runStore
        && !options.runExecutor
        &&
            typeof runStore.listStaleActiveRuns === "function"
        && typeof runStore.setActiveStepsFailed === "function";
    if (canRecover) {
        try {
            await (0, recovery_1.recoverStaleActiveRuns)({
                runStore,
                logger: app.log,
                staleMinutes: config.runRecoveryStaleMinutes,
            });
        }
        catch (error) {
            app.log.warn({ error }, "run recovery skipped after boot-time error");
        }
    }
    else {
        app.log.warn("run recovery skipped: store does not support reconciliation hooks");
    }
    const runWorker = options.runWorker
        ?? (0, worker_1.startRunWorker)({
            runStore,
            runExecutor,
            logger: app.log,
            pollIntervalMs: config.runWorkerPollIntervalMs,
        });
    app.addHook("onClose", async () => {
        runWorker.stop();
    });
    const policyMap = (0, policy_store_1.buildPolicyMap)(config);
    const toolRegistry = (0, tool_registry_1.getToolRegistry)();
    app.post("/plans/draft", async (request, reply) => {
        const draftStartedMs = Date.now();
        const progress = [];
        const trackStage = async (stage, fn) => {
            const stageStarted = Date.now();
            const result = await fn();
            progress.push({ stage, duration_ms: Date.now() - stageStarted });
            return result;
        };
        const scope = getRequestScope(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const validated = parseDraftPayload(request.body);
        if (!validated.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", validated.error ?? "Invalid payload"));
        }
        const payload = validated.value;
        const installationId = scope.value.installationId;
        const wpUserId = scope.value.wpUserId;
        if (!(await planStore.isPairedInstallation(installationId))) {
            return reply
                .code(404)
                .send(errorResponse("INSTALLATION_NOT_PAIRED", "Installation is not paired"));
        }
        const policy = policyMap[payload.policyPreset];
        const rateViolation = (0, enforcement_1.enforceRateLimit)({
            limiter: planRateLimiter,
            key: `${installationId}:${wpUserId}:${payload.policyPreset}:plan`,
            policy,
        });
        if (rateViolation) {
            return reply.code(rateViolation.statusCode).send(toPolicyViolationResponse(rateViolation));
        }
        const usedTokensToday = await planStore.sumPlanUsageTokensForDay({
            installationId,
            wpUserId,
            dayStartIso: (0, usage_ledger_1.getUtcDayStartIso)(),
        });
        const budgetViolation = (0, enforcement_1.enforceDailyBudget)(usedTokensToday, policy);
        if (budgetViolation) {
            return reply.code(budgetViolation.statusCode).send(toPolicyViolationResponse(budgetViolation));
        }
        const skill = await skillStore.getSkill(installationId, payload.skillId);
        if (!skill) {
            return reply
                .code(404)
                .send(errorResponse("SKILL_NOT_FOUND", "Skill does not exist for this installation"));
        }
        const maxSteps = Math.max(1, config.planMaxSteps);
        const maxToolCalls = Math.max(1, config.planMaxToolCalls);
        const maxPages = Math.max(1, config.planMaxPages);
        const maxCostUsd = Math.max(0.01, config.planMaxCostUsd);
        const selectedModel = (0, model_select_1.selectModelForPolicy)({
            policy,
            policyPreset: payload.policyPreset,
            taskClass: "planning",
            explicitPreference: payload.modelPreference
                ?? parsePreferenceHeader(request.headers["x-wp-agent-model-preference"]),
            routeDefaultPreference: "quality",
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
        const policyContext = {
            policyPreset: payload.policyPreset,
            model: selectedModel.model,
            maxSteps,
            maxToolCalls,
            maxPages,
            maxCostUsd,
        };
        const plannerMessages = (0, planner_prompt_1.buildPlannerMessages)({
            skill,
            goal: payload.goal,
            inputs: payload.inputs,
            policy: policyContext,
        }).map((message) => ({
            role: message.role,
            content: message.content,
        }));
        let llmRawOutput = "";
        let llmUsageTokens = 0;
        let providerRequestId;
        try {
            const completion = await trackStage("llm_completion", () => withTimeout(() => llmClient.completeChat({
                requestId: llmRequestId,
                model: selectedModel.model,
                messages: plannerMessages,
                maxTokens: 1100,
            }), Math.max(500, config.planDraftLlmTimeoutMs), "plan draft llm timed out"));
            llmRawOutput = completion.content;
            llmUsageTokens = completion.usageTokens;
            providerRequestId = completion.providerRequestId;
            request.log.info({
                requestId: request.id,
                llmRequestId,
                providerRequestId,
                taskClass: selectedModel.taskClass,
                preference: selectedModel.preference,
                selectedModel: completion.model,
                routingReason: selectedModel.routingReason,
            }, "llm request completed");
        }
        catch (error) {
            if (error instanceof Error && error.message === "plan draft llm timed out") {
                return reply
                    .code(504)
                    .send(errorResponse("PLAN_LLM_TIMEOUT", "Planner model request timed out"));
            }
            request.log.error({ error, requestId: request.id, llmRequestId }, "plan draft llm request failed");
            return reply
                .code(502)
                .send(errorResponse("PLAN_LLM_FAILED", "Planner model request failed"));
        }
        if (llmRawOutput.length > config.planDraftMaxOutputChars) {
            return reply
                .code(400)
                .send(errorResponse("PLAN_OUTPUT_CAP_EXCEEDED", `Planner output exceeded max allowed characters (${config.planDraftMaxOutputChars})`));
        }
        let parsedPlan;
        try {
            parsedPlan = (0, plan_parse_1.parseSinglePlanJsonBlock)(llmRawOutput);
        }
        catch (error) {
            if (error instanceof plan_parse_1.PlanParseError) {
                return reply.code(400).send(errorResponse(error.code, error.message));
            }
            return reply
                .code(400)
                .send(errorResponse("PLAN_SCHEMA_INVALID", "Planner output could not be parsed"));
        }
        let manifestToolNames;
        try {
            manifestToolNames = await trackStage("manifest_fetch", () => withTimeout(() => manifestToolsLoader(installationId), Math.max(500, config.planDraftManifestTimeoutMs), "plan draft manifest fetch timed out"));
        }
        catch (error) {
            if (error instanceof Error && error.message === "plan draft manifest fetch timed out") {
                return reply.code(504).send(errorResponse("PLAN_MANIFEST_TIMEOUT", "Timed out while loading tool manifest for installation"));
            }
            request.log.error({ error }, "plan draft manifest fetch failed");
            return reply.code(502).send(errorResponse("PLAN_MANIFEST_FETCH_FAILED", "Failed to load tool manifest for installation"));
        }
        const validation = (0, plan_validate_1.validatePlanDraft)({
            parsed: parsedPlan,
            skill,
            policy: policyContext,
            toolRegistry,
            manifestToolNames,
        });
        let estimateResult = {
            estimate: {
                estimatedPages: 0,
                estimatedToolCalls: {},
                estimatedTokensBucket: "low",
                estimatedCostUsdBand: "low",
                estimatedRuntimeSec: 0,
                confidenceBand: "low",
                estimatedCostUsd: 0,
            },
            risk: {
                tier: "LOW",
                score: 0,
                factors: {
                    numberOfSteps: 0,
                    writeIntensity: 0,
                    toolNovelty: 0,
                    costRatioToCap: 0,
                },
            },
            gatingIssues: [],
        };
        if (validation.plan) {
            const effectiveMaxCost = Math.min(maxCostUsd, skill.caps.maxCostUsd ?? Number.MAX_SAFE_INTEGER);
            estimateResult = (0, estimate_1.estimatePlan)({
                steps: validation.plan.steps,
                toolRegistry,
                maxCostUsd: Number.isFinite(effectiveMaxCost) ? effectiveMaxCost : maxCostUsd,
            });
        }
        const allIssues = [...validation.issues, ...estimateResult.gatingIssues];
        const status = allIssues.length === 0 ? "validated" : "rejected";
        const canonicalPlan = validation.plan ?? {
            planVersion: 1,
            skillId: payload.skillId,
            goal: payload.goal,
            assumptions: [],
            inputs: payload.inputs,
            steps: [],
        };
        const planId = (0, node_crypto_1.randomUUID)();
        const planHash = (0, plan_contract_1.computePlanHash)({
            planVersion: 1,
            skillId: canonicalPlan.skillId,
            goal: canonicalPlan.goal,
            assumptions: canonicalPlan.assumptions,
            inputs: canonicalPlan.inputs,
            steps: canonicalPlan.steps,
            policyContext,
        });
        const storedPlan = await planStore.createPlan({
            planId,
            installationId,
            wpUserId,
            skillId: canonicalPlan.skillId,
            policyPreset: payload.policyPreset,
            status,
            goal: canonicalPlan.goal,
            assumptions: canonicalPlan.assumptions,
            inputs: canonicalPlan.inputs,
            steps: canonicalPlan.steps,
            estimates: estimateResult.estimate,
            risk: estimateResult.risk,
            policyContext,
            planHash,
            validationIssues: allIssues,
            llmUsageTokens,
            llm: {
                selectedModel: selectedModel.model,
                taskClass: selectedModel.taskClass,
                preference: selectedModel.preference,
                requestId: llmRequestId,
                providerRequestId,
            },
        });
        await planStore.appendPlanEvent({
            planId,
            eventType: "draft",
            actorType: "system",
            actorId: "planner",
            payload: {
                status,
            },
        });
        await planStore.appendPlanEvent({
            planId,
            eventType: status === "validated" ? "validated" : "rejected",
            actorType: "system",
            actorId: "validator",
            payload: {
                issue_count: allIssues.length,
            },
        });
        const events = await planStore.listPlanEvents(planId);
        const responsePlan = mapPlanRecordToContract(storedPlan);
        return reply.code(200).send({
            ok: true,
            data: {
                plan: (0, plan_contract_1.toApiPlan)(responsePlan),
                events: events.map((event) => toApiEvent(event)),
            },
            error: null,
            meta: {
                progress,
                elapsed_ms: Date.now() - draftStartedMs,
            },
        });
    });
    app.get("/plans/:planId", async (request, reply) => {
        const params = request.params;
        const scope = getRequestScope(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const planId = String(params.planId ?? "").trim();
        if (!isValidUuid(planId)) {
            return reply.code(400).send(errorResponse("VALIDATION_ERROR", "planId must be a valid UUID"));
        }
        const plan = await planStore.getPlan(planId);
        if (!plan
            || plan.installationId !== scope.value.installationId
            || plan.wpUserId !== scope.value.wpUserId) {
            return reply
                .code(404)
                .send(errorResponse("PLAN_NOT_FOUND", "Plan was not found for this user scope"));
        }
        const events = await planStore.listPlanEvents(plan.planId);
        return reply.code(200).send({
            ok: true,
            data: {
                plan: (0, plan_contract_1.toApiPlan)(mapPlanRecordToContract(plan)),
                events: events.map((event) => toApiEvent(event)),
            },
            error: null,
            meta: null,
        });
    });
    app.post("/plans/:planId/approve", async (request, reply) => {
        const params = request.params;
        const scope = getRequestScope(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const planId = String(params.planId ?? "").trim();
        if (!isValidUuid(planId)) {
            return reply.code(400).send(errorResponse("VALIDATION_ERROR", "planId must be a valid UUID"));
        }
        const existing = await planStore.getPlan(planId);
        if (!existing
            || existing.installationId !== scope.value.installationId
            || existing.wpUserId !== scope.value.wpUserId) {
            return reply
                .code(404)
                .send(errorResponse("PLAN_NOT_FOUND", "Plan was not found for this user scope"));
        }
        if (existing.status !== "validated") {
            return reply.code(409).send(errorResponse("PLAN_NOT_APPROVABLE", "Only plans in validated status can be approved"));
        }
        const updated = await planStore.updatePlanStatus({
            planId,
            status: "approved",
            installationId: scope.value.installationId,
            wpUserId: scope.value.wpUserId,
        });
        if (!updated) {
            return reply
                .code(404)
                .send(errorResponse("PLAN_NOT_FOUND", "Plan was not found for this user scope"));
        }
        await planStore.appendPlanEvent({
            planId,
            eventType: "approved",
            actorType: "user",
            actorId: String(scope.value.wpUserId),
            payload: {},
        });
        const events = await planStore.listPlanEvents(planId);
        return reply.code(200).send({
            ok: true,
            data: {
                plan: (0, plan_contract_1.toApiPlan)(mapPlanRecordToContract(updated)),
                events: events.map((event) => toApiEvent(event)),
            },
            error: null,
            meta: null,
        });
    });
    app.post("/runs", async (request, reply) => {
        const scope = getRequestScope(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const parsed = parseRunCreatePayload(request.body);
        if (!parsed.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", parsed.error ?? "Invalid payload"));
        }
        const payload = parsed.value;
        const installationId = scope.value.installationId;
        const wpUserId = scope.value.wpUserId;
        if (!(await planStore.isPairedInstallation(installationId))) {
            return reply
                .code(404)
                .send(errorResponse("INSTALLATION_NOT_PAIRED", "Installation is not paired"));
        }
        const activeRun = await runStore.getActiveRunForInstallation(installationId);
        if (activeRun) {
            return reply.code(409).send(errorResponse("RUN_ACTIVE_CONFLICT", "Installation already has an active run", {
                active_run_id: activeRun.runId,
            }));
        }
        const plan = await planStore.getPlan(payload.planId);
        if (!plan
            || plan.installationId !== installationId
            || plan.wpUserId !== wpUserId) {
            return reply
                .code(404)
                .send(errorResponse("PLAN_NOT_FOUND", "Plan was not found for this user scope"));
        }
        if (plan.status !== "approved") {
            return reply.code(409).send(errorResponse("RUN_PLAN_NOT_APPROVED", "Plan must be approved before execution"));
        }
        const skill = await skillStore.getSkill(installationId, plan.skillId);
        if (!skill) {
            return reply
                .code(404)
                .send(errorResponse("SKILL_NOT_FOUND", "Skill does not exist for this installation"));
        }
        let mapped;
        try {
            mapped = (0, input_mapper_1.mapRunExecutionInput)({
                plan,
                skill,
                envCaps: {
                    maxSteps: config.runMaxSteps,
                    maxToolCalls: config.runMaxToolCalls,
                    maxPages: config.runMaxPages,
                },
                maxPagesPerBulk: config.runMaxPagesPerBulk,
            });
        }
        catch (error) {
            if (error instanceof input_mapper_1.RunInputError) {
                return reply.code(400).send(errorResponse(error.code, error.message));
            }
            return reply
                .code(400)
                .send(errorResponse("RUN_INVALID_INPUT", "Run input could not be mapped"));
        }
        const runId = (0, node_crypto_1.randomUUID)();
        const createdRun = await runStore.createRun({
            runId,
            installationId,
            wpUserId,
            planId: payload.planId,
            plannedSteps: mapped.plannedSteps,
            plannedToolCalls: mapped.plannedToolCalls,
            plannedPages: mapped.plannedPages,
            inputPayload: {
                mode: mapped.mode,
                step_id: mapped.stepId,
                pages: mapped.pages,
                effective_caps: mapped.effectiveCaps,
            },
            steps: [
                {
                    stepId: mapped.stepId,
                    plannedToolCalls: mapped.plannedToolCalls,
                    plannedPages: mapped.plannedPages,
                },
            ],
        });
        await runStore.appendRunEvent({
            runId,
            eventType: "run_created",
            payload: {
                plan_id: payload.planId,
                mode: mapped.mode,
                page_count: mapped.pages.length,
            },
        });
        const details = await runStore.getRunWithDetails(runId);
        return reply.code(202).send({
            ok: true,
            data: {
                run: toApiRun(createdRun),
                steps: details?.steps.map((step) => ({
                    step_id: step.stepId,
                    status: step.status,
                    planned_tool_calls: step.plannedToolCalls,
                    planned_pages: step.plannedPages,
                    actual_tool_calls: step.actualToolCalls,
                    actual_pages: step.actualPages,
                    error_code: step.errorCode,
                    error_message: step.errorMessage,
                    started_at: step.startedAt,
                    finished_at: step.finishedAt,
                })) ?? [],
                events: details?.events.map((event) => ({
                    id: event.id,
                    event_type: event.eventType,
                    payload: event.payload,
                    created_at: event.createdAt,
                })) ?? [],
                rollbacks: details?.rollbacks.map((rollback) => ({
                    handle_id: rollback.handleId,
                    kind: rollback.kind,
                    status: rollback.status,
                    error: rollback.error,
                    created_at: rollback.createdAt,
                    applied_at: rollback.appliedAt,
                })) ?? [],
            },
            error: null,
            meta: null,
        });
    });
    app.get("/runs/:runId", async (request, reply) => {
        const params = request.params;
        const scope = getRequestScope(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const runId = String(params.runId ?? "").trim();
        if (!isValidUuid(runId)) {
            return reply.code(400).send(errorResponse("VALIDATION_ERROR", "runId must be a valid UUID"));
        }
        const details = await runStore.getRunWithDetails(runId);
        if (!details
            || details.run.installationId !== scope.value.installationId
            || details.run.wpUserId !== scope.value.wpUserId) {
            return reply
                .code(404)
                .send(errorResponse("RUN_NOT_FOUND", "Run was not found for this user scope"));
        }
        return reply.code(200).send({
            ok: true,
            data: {
                run: toApiRun(details.run),
                steps: details.steps.map((step) => ({
                    step_id: step.stepId,
                    status: step.status,
                    planned_tool_calls: step.plannedToolCalls,
                    planned_pages: step.plannedPages,
                    actual_tool_calls: step.actualToolCalls,
                    actual_pages: step.actualPages,
                    error_code: step.errorCode,
                    error_message: step.errorMessage,
                    started_at: step.startedAt,
                    finished_at: step.finishedAt,
                })),
                events: details.events.map((event) => ({
                    id: event.id,
                    event_type: event.eventType,
                    payload: event.payload,
                    created_at: event.createdAt,
                })),
                rollbacks: details.rollbacks.map((rollback) => ({
                    handle_id: rollback.handleId,
                    kind: rollback.kind,
                    status: rollback.status,
                    error: rollback.error,
                    created_at: rollback.createdAt,
                    applied_at: rollback.appliedAt,
                })),
            },
            error: null,
            meta: null,
        });
    });
    app.post("/runs/:runId/rollback", async (request, reply) => {
        const params = request.params;
        const scope = getRequestScope(request);
        if (!scope.value) {
            return reply
                .code(400)
                .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid scope"));
        }
        const runId = String(params.runId ?? "").trim();
        if (!isValidUuid(runId)) {
            return reply.code(400).send(errorResponse("VALIDATION_ERROR", "runId must be a valid UUID"));
        }
        const details = await runStore.getRunWithDetails(runId);
        if (!details
            || details.run.installationId !== scope.value.installationId
            || details.run.wpUserId !== scope.value.wpUserId) {
            return reply
                .code(404)
                .send(errorResponse("RUN_NOT_FOUND", "Run was not found for this user scope"));
        }
        if (!details.run.rollbackAvailable) {
            return reply
                .code(409)
                .send(errorResponse("RUN_ROLLBACK_NOT_AVAILABLE", "Run has no rollback handles"));
        }
        try {
            await runExecutor.rollbackRun(runId, scope.value.installationId);
        }
        catch (error) {
            return reply.code(502).send(errorResponse("RUN_ROLLBACK_FAILED", error instanceof Error ? error.message : "Rollback failed"));
        }
        const updated = await runStore.getRunWithDetails(runId);
        if (!updated) {
            return reply
                .code(404)
                .send(errorResponse("RUN_NOT_FOUND", "Run was not found for this user scope"));
        }
        return reply.code(200).send({
            ok: true,
            data: {
                run: toApiRun(updated.run),
                steps: updated.steps.map((step) => ({
                    step_id: step.stepId,
                    status: step.status,
                    planned_tool_calls: step.plannedToolCalls,
                    planned_pages: step.plannedPages,
                    actual_tool_calls: step.actualToolCalls,
                    actual_pages: step.actualPages,
                    error_code: step.errorCode,
                    error_message: step.errorMessage,
                    started_at: step.startedAt,
                    finished_at: step.finishedAt,
                })),
                events: updated.events.map((event) => ({
                    id: event.id,
                    event_type: event.eventType,
                    payload: event.payload,
                    created_at: event.createdAt,
                })),
                rollbacks: updated.rollbacks.map((rollback) => ({
                    handle_id: rollback.handleId,
                    kind: rollback.kind,
                    status: rollback.status,
                    error: rollback.error,
                    created_at: rollback.createdAt,
                    applied_at: rollback.appliedAt,
                })),
            },
            error: null,
            meta: null,
        });
    });
}
