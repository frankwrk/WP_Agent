import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { assertProductionDatabaseConfigured, getConfig, type AppConfig } from "../config";
import { buildPool } from "../db/pool";
import {
  enforceDailyBudget,
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
  computePlanHash,
  toApiPlan,
  type PlanContract,
  type PlanStatus,
} from "../services/plans/plan.contract";
import { estimatePlan, type PlanEstimateResult } from "../services/plans/estimate";
import { parseSinglePlanJsonBlock, PlanParseError } from "../services/plans/plan.parse";
import {
  validatePlanDraft,
  type PlanPolicyContext,
  type PlanValidationIssue,
} from "../services/plans/plan.validate";
import { getToolRegistry } from "../services/plans/tool.registry";
import {
  MemoryPlanStore,
  PostgresPlanStore,
  type PlanRecord,
  type PlanStore,
} from "../services/plans/store";
import {
  MemorySkillStore,
  PostgresSkillStore,
  type SkillStore,
} from "../services/skills/store";
import {
  MemoryRunStore,
  PostgresRunStore,
  type RunStore,
  type RunRecord,
} from "../services/runs/store";
import { RunExecutor } from "../services/runs/executor";
import { recoverStaleActiveRuns } from "../services/runs/recovery";
import { startRunWorker, type RunWorkerHandle } from "../services/runs/worker";
import { mapRunExecutionInput, RunInputError } from "../services/runs/input.mapper";
import { fetchToolManifest } from "../services/wp/tool.manifest";
import { buildPlannerMessages } from "../services/plans/planner.prompt";

const planRateLimiter = new FixedWindowRateLimiter();

export interface RunsRouteOptions {
  config?: AppConfig;
  planStore?: PlanStore;
  skillStore?: SkillStore;
  runStore?: RunStore;
  runExecutor?: RunExecutor;
  runWorker?: RunWorkerHandle;
  llmClient?: LlmClient;
  manifestToolsLoader?: (installationId: string) => Promise<Set<string>>;
}

let cachedPool: Pool | null = null;

function getPool(config: AppConfig, logger?: FastifyInstance["log"]): Pool | null {
  if (!config.databaseUrl) {
    return null;
  }

  if (!cachedPool) {
    cachedPool = buildPool(config, logger);
  }

  return cachedPool;
}

function createPlanStore(config: AppConfig, logger?: FastifyInstance["log"]): PlanStore {
  assertProductionDatabaseConfigured(config);
  const pool = getPool(config, logger);
  if (!pool) {
    return new MemoryPlanStore();
  }

  return new PostgresPlanStore(pool);
}

function createSkillStore(config: AppConfig, logger?: FastifyInstance["log"]): SkillStore {
  assertProductionDatabaseConfigured(config);
  const pool = getPool(config, logger);
  if (!pool) {
    return new MemorySkillStore();
  }

  return new PostgresSkillStore(pool);
}

function createRunStore(config: AppConfig, logger?: FastifyInstance["log"]): RunStore {
  assertProductionDatabaseConfigured(config);
  const pool = getPool(config, logger);
  if (!pool) {
    return new MemoryRunStore();
  }

  return new PostgresRunStore(pool);
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

function toPolicyViolationResponse(violation: PolicyViolation) {
  return errorResponse(violation.code, violation.message, {
    retry_after: violation.retryAfterSeconds,
  });
}

function toApiEvent(event: {
  id: string;
  planId: string;
  eventType: "draft" | "validated" | "approved" | "rejected";
  actorType: "system" | "user";
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}): Record<string, unknown> {
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

function mapPlanRecordToContract(record: PlanRecord): PlanContract {
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

function toApiRun(record: RunRecord): Record<string, unknown> {
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

function parseRunCreatePayload(raw: unknown): {
  value?: {
    planId: string;
  };
  error?: string;
} {
  if (!raw || typeof raw !== "object") {
    return { error: "Payload must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
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

function parseDraftPayload(raw: unknown): {
  value?: {
    policyPreset: PolicyPreset;
    modelPreference: ReturnType<typeof parseModelPreference>;
    skillId: string;
    goal: string;
    inputs: Record<string, unknown>;
  };
  error?: string;
} {
  if (!raw || typeof raw !== "object") {
    return { error: "Payload must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
  const policyPreset = String(body.policy_preset ?? "balanced").trim().toLowerCase();
  const modelPreference = parseModelPreference(body.model_preference);
  const skillId = String(body.skill_id ?? "").trim();
  const goal = String(body.goal ?? "").trim();
  const inputs = body.inputs;

  if (!isPolicyPreset(policyPreset)) {
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
      inputs: inputs as Record<string, unknown>,
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

async function withTimeout<T>(
  factory: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      factory(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function defaultManifestToolLoader(
  installationId: string,
  config: AppConfig,
): Promise<Set<string>> {
  const manifest = await fetchToolManifest(installationId, config.wpToolApiBase);
  return new Set(manifest.data.tools.map((tool) => tool.name));
}

export async function runsRoutes(app: FastifyInstance, options: RunsRouteOptions = {}) {
  const config = options.config ?? getConfig();
  const planStore = options.planStore ?? createPlanStore(config, app.log);
  const skillStore = options.skillStore ?? createSkillStore(config, app.log);
  const runStore = options.runStore ?? createRunStore(config, app.log);
  const llmClient = options.llmClient ?? new AiGatewayClient();
  const manifestToolsLoader = options.manifestToolsLoader
    ? options.manifestToolsLoader
    : (installationId: string) => defaultManifestToolLoader(installationId, config);

  const runExecutor = options.runExecutor ?? new RunExecutor({
    runStore,
    wpToolApiBase: config.wpToolApiBase,
    jobPollIntervalMs: Math.max(100, config.runJobPollIntervalMs),
    jobPollAttempts: Math.max(1, config.runJobPollAttempts),
    logger: app.log,
  });

  const canRecover =
    !options.runStore
    && !options.runExecutor
    &&
    typeof (runStore as Partial<RunStore>).listStaleActiveRuns === "function"
    && typeof (runStore as Partial<RunStore>).setActiveStepsFailed === "function";

  if (canRecover) {
    try {
      await recoverStaleActiveRuns({
        runStore,
        logger: app.log,
        staleMinutes: config.runRecoveryStaleMinutes,
      });
    } catch (error) {
      app.log.warn({ error }, "run recovery skipped after boot-time error");
    }
  } else {
    app.log.warn("run recovery skipped: store does not support reconciliation hooks");
  }

  const runWorker =
    options.runWorker
    ?? startRunWorker({
      runStore,
      runExecutor,
      logger: app.log,
      pollIntervalMs: config.runWorkerPollIntervalMs,
    });

  app.addHook("onClose", async () => {
    runWorker.stop();
  });

  const policyMap = buildPolicyMap(config);
  const toolRegistry = getToolRegistry();
  app.post("/plans/draft", async (request, reply) => {
    const draftStartedMs = Date.now();
    const progress: Array<{ stage: string; duration_ms: number }> = [];
    const trackStage = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
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

    const rateViolation = enforceRateLimit({
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
      dayStartIso: getUtcDayStartIso(),
    });

    const budgetViolation = enforceDailyBudget(usedTokensToday, policy);
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

    const selectedModel = selectModelForPolicy({
      policy,
      policyPreset: payload.policyPreset,
      taskClass: "planning",
      explicitPreference:
        payload.modelPreference
        ?? parsePreferenceHeader(request.headers["x-wp-agent-model-preference"]),
      routeDefaultPreference: "quality",
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

    const policyContext: PlanPolicyContext = {
      policyPreset: payload.policyPreset,
      model: selectedModel.model,
      maxSteps,
      maxToolCalls,
      maxPages,
      maxCostUsd,
    };

    const plannerMessages = buildPlannerMessages({
      skill,
      goal: payload.goal,
      inputs: payload.inputs,
      policy: policyContext,
    }).map((message) => ({
      role: message.role,
      content: message.content,
    })) as ChatCompletionMessage[];

    let llmRawOutput = "";
    let llmUsageTokens = 0;
    let providerRequestId: string | undefined;

    try {
      const completion = await trackStage("llm_completion", () =>
        withTimeout(
          () =>
            llmClient.completeChat({
              requestId: llmRequestId,
              model: selectedModel.model,
              messages: plannerMessages,
              maxTokens: 1100,
            }),
          Math.max(500, config.planDraftLlmTimeoutMs),
          "plan draft llm timed out",
        ));
      llmRawOutput = completion.content;
      llmUsageTokens = completion.usageTokens;
      providerRequestId = completion.providerRequestId;

      request.log.info(
        {
          requestId: request.id,
          llmRequestId,
          providerRequestId,
          taskClass: selectedModel.taskClass,
          preference: selectedModel.preference,
          selectedModel: completion.model,
          routingReason: selectedModel.routingReason,
        },
        "llm request completed",
      );
    } catch (error) {
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
        .send(
          errorResponse(
            "PLAN_OUTPUT_CAP_EXCEEDED",
            `Planner output exceeded max allowed characters (${config.planDraftMaxOutputChars})`,
          ),
        );
    }

    let parsedPlan: Record<string, unknown>;
    try {
      parsedPlan = parseSinglePlanJsonBlock(llmRawOutput);
    } catch (error) {
      if (error instanceof PlanParseError) {
        return reply.code(400).send(errorResponse(error.code, error.message));
      }

      return reply
        .code(400)
        .send(errorResponse("PLAN_SCHEMA_INVALID", "Planner output could not be parsed"));
    }

    let manifestToolNames: Set<string>;
    try {
      manifestToolNames = await trackStage("manifest_fetch", () =>
        withTimeout(
          () => manifestToolsLoader(installationId),
          Math.max(500, config.planDraftManifestTimeoutMs),
          "plan draft manifest fetch timed out",
        ));
    } catch (error) {
      if (error instanceof Error && error.message === "plan draft manifest fetch timed out") {
        return reply.code(504).send(
          errorResponse(
            "PLAN_MANIFEST_TIMEOUT",
            "Timed out while loading tool manifest for installation",
          ),
        );
      }

      request.log.error({ error }, "plan draft manifest fetch failed");
      return reply.code(502).send(
        errorResponse(
          "PLAN_MANIFEST_FETCH_FAILED",
          "Failed to load tool manifest for installation",
        ),
      );
    }

    const validation = validatePlanDraft({
      parsed: parsedPlan,
      skill,
      policy: policyContext,
      toolRegistry,
      manifestToolNames,
    });

    let estimateResult: PlanEstimateResult = {
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
      const effectiveMaxCost = Math.min(
        maxCostUsd,
        skill.caps.maxCostUsd ?? Number.MAX_SAFE_INTEGER,
      );
      estimateResult = estimatePlan({
        steps: validation.plan.steps,
        toolRegistry,
        maxCostUsd: Number.isFinite(effectiveMaxCost) ? effectiveMaxCost : maxCostUsd,
      });
    }

    const allIssues = [...validation.issues, ...estimateResult.gatingIssues];
    const status: PlanStatus = allIssues.length === 0 ? "validated" : "rejected";

    const canonicalPlan = validation.plan ?? {
      planVersion: 1 as const,
      skillId: payload.skillId,
      goal: payload.goal,
      assumptions: [] as string[],
      inputs: payload.inputs,
      steps: [],
    };

    const planId = randomUUID();
    const planHash = computePlanHash({
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
        plan: toApiPlan(responsePlan),
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

    const params = request.params as { planId?: string };
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
    if (
      !plan
      || plan.installationId !== scope.value.installationId
      || plan.wpUserId !== scope.value.wpUserId
    ) {
      return reply
        .code(404)
        .send(errorResponse("PLAN_NOT_FOUND", "Plan was not found for this user scope"));
    }

    const events = await planStore.listPlanEvents(plan.planId);

    return reply.code(200).send({
      ok: true,
      data: {
        plan: toApiPlan(mapPlanRecordToContract(plan)),
        events: events.map((event) => toApiEvent(event)),
      },
      error: null,
      meta: null,
    });
  });

  app.post("/plans/:planId/approve", async (request, reply) => {

    const params = request.params as { planId?: string };
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
    if (
      !existing
      || existing.installationId !== scope.value.installationId
      || existing.wpUserId !== scope.value.wpUserId
    ) {
      return reply
        .code(404)
        .send(errorResponse("PLAN_NOT_FOUND", "Plan was not found for this user scope"));
    }

    if (existing.status !== "validated") {
      return reply.code(409).send(
        errorResponse(
          "PLAN_NOT_APPROVABLE",
          "Only plans in validated status can be approved",
        ),
      );
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
        plan: toApiPlan(mapPlanRecordToContract(updated)),
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
      return reply.code(409).send(
        errorResponse("RUN_ACTIVE_CONFLICT", "Installation already has an active run", {
          active_run_id: activeRun.runId,
        }),
      );
    }

    const plan = await planStore.getPlan(payload.planId);
    if (
      !plan
      || plan.installationId !== installationId
      || plan.wpUserId !== wpUserId
    ) {
      return reply
        .code(404)
        .send(errorResponse("PLAN_NOT_FOUND", "Plan was not found for this user scope"));
    }

    if (plan.status !== "approved") {
      return reply.code(409).send(
        errorResponse("RUN_PLAN_NOT_APPROVED", "Plan must be approved before execution"),
      );
    }

    const skill = await skillStore.getSkill(installationId, plan.skillId);
    if (!skill) {
      return reply
        .code(404)
        .send(errorResponse("SKILL_NOT_FOUND", "Skill does not exist for this installation"));
    }

    let mapped;
    try {
      mapped = mapRunExecutionInput({
        plan,
        skill,
        envCaps: {
          maxSteps: config.runMaxSteps,
          maxToolCalls: config.runMaxToolCalls,
          maxPages: config.runMaxPages,
        },
        maxPagesPerBulk: config.runMaxPagesPerBulk,
      });
    } catch (error) {
      if (error instanceof RunInputError) {
        return reply.code(400).send(errorResponse(error.code, error.message));
      }

      return reply
        .code(400)
        .send(errorResponse("RUN_INVALID_INPUT", "Run input could not be mapped"));
    }

    const runId = randomUUID();
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

    const params = request.params as { runId?: string };
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
    if (
      !details
      || details.run.installationId !== scope.value.installationId
      || details.run.wpUserId !== scope.value.wpUserId
    ) {
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

    const params = request.params as { runId?: string };
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
    if (
      !details
      || details.run.installationId !== scope.value.installationId
      || details.run.wpUserId !== scope.value.wpUserId
    ) {
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
    } catch (error) {
      return reply.code(502).send(
        errorResponse(
          "RUN_ROLLBACK_FAILED",
          error instanceof Error ? error.message : "Rollback failed",
        ),
      );
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
