import { randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { getConfig, type AppConfig } from "../config";
import {
  enforceDailyBudget,
  enforceRateLimit,
  type PolicyViolation,
} from "../services/policy/enforcement";
import { FixedWindowRateLimiter } from "../services/policy/limiter";
import { buildPolicyMap } from "../services/policy/policy.store";
import { isPolicyPreset, type PolicyPreset } from "../services/policy/policy.schema";
import {
  OpenRouterClient,
  type ChatCompletionMessage,
  type LlmClient,
} from "../services/llm/openrouter.client";
import { selectModelForPolicy } from "../services/llm/model.select";
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
import { fetchToolManifest } from "../services/wp/tool.manifest";
import { buildPlannerMessages } from "../services/plans/planner.prompt";

const planRateLimiter = new FixedWindowRateLimiter();

export interface RunsRouteOptions {
  config?: AppConfig;
  planStore?: PlanStore;
  skillStore?: SkillStore;
  llmClient?: LlmClient;
  manifestToolsLoader?: (installationId: string) => Promise<Set<string>>;
}

let cachedPool: Pool | null = null;

function getPool(config: AppConfig): Pool | null {
  if (!config.databaseUrl) {
    return null;
  }

  if (!cachedPool) {
    cachedPool = new Pool({ connectionString: config.databaseUrl });
  }

  return cachedPool;
}

function createPlanStore(config: AppConfig): PlanStore {
  const pool = getPool(config);
  if (!pool) {
    return new MemoryPlanStore();
  }

  return new PostgresPlanStore(pool);
}

function createSkillStore(config: AppConfig): SkillStore {
  const pool = getPool(config);
  if (!pool) {
    return new MemorySkillStore();
  }

  return new PostgresSkillStore(pool);
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function validateBootstrapHeader(
  rawHeader: string | string[] | undefined,
  config: AppConfig,
): boolean {
  if (!config.pairingBootstrapSecret) {
    return false;
  }

  const header = Array.isArray(rawHeader) ? rawHeader[0] ?? "" : String(rawHeader ?? "");
  if (!header) {
    return false;
  }

  return constantTimeEqual(header, config.pairingBootstrapSecret);
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
    status: record.status,
    llmUsageTokens: record.llmUsageTokens,
    llmModel: record.llmModel,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseDraftPayload(raw: unknown): {
  value?: {
    installationId: string;
    wpUserId: number;
    policyPreset: PolicyPreset;
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
  const installationId = String(body.installation_id ?? "").trim();
  const wpUserId = Number.parseInt(String(body.wp_user_id ?? ""), 10);
  const policyPreset = String(body.policy_preset ?? "balanced").trim().toLowerCase();
  const skillId = String(body.skill_id ?? "").trim();
  const goal = String(body.goal ?? "").trim();
  const inputs = body.inputs;

  if (!isValidUuid(installationId)) {
    return { error: "installation_id must be a valid UUID" };
  }

  if (!Number.isInteger(wpUserId) || wpUserId <= 0) {
    return { error: "wp_user_id must be a positive integer" };
  }

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
      installationId,
      wpUserId,
      policyPreset,
      skillId,
      goal,
      inputs: inputs as Record<string, unknown>,
    },
  };
}

function parsePlanScopePayload(raw: unknown): {
  value?: {
    installationId: string;
    wpUserId: number;
  };
  error?: string;
} {
  if (!raw || typeof raw !== "object") {
    return { error: "Payload must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
  const installationId = String(body.installation_id ?? "").trim();
  const wpUserId = Number.parseInt(String(body.wp_user_id ?? ""), 10);

  if (!isValidUuid(installationId)) {
    return { error: "installation_id must be a valid UUID" };
  }

  if (!Number.isInteger(wpUserId) || wpUserId <= 0) {
    return { error: "wp_user_id must be a positive integer" };
  }

  return {
    value: {
      installationId,
      wpUserId,
    },
  };
}

function parsePlanScopeQuery(raw: unknown): {
  value?: {
    installationId: string;
    wpUserId: number;
  };
  error?: string;
} {
  if (!raw || typeof raw !== "object") {
    return { error: "Query must be provided" };
  }

  const query = raw as Record<string, unknown>;
  const installationId = String(query.installation_id ?? "").trim();
  const wpUserId = Number.parseInt(String(query.wp_user_id ?? ""), 10);

  if (!isValidUuid(installationId)) {
    return { error: "installation_id must be a valid UUID" };
  }

  if (!Number.isInteger(wpUserId) || wpUserId <= 0) {
    return { error: "wp_user_id must be a positive integer" };
  }

  return {
    value: {
      installationId,
      wpUserId,
    },
  };
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
  const planStore = options.planStore ?? createPlanStore(config);
  const skillStore = options.skillStore ?? createSkillStore(config);
  const llmClient = options.llmClient ?? new OpenRouterClient();
  const manifestToolsLoader = options.manifestToolsLoader
    ? options.manifestToolsLoader
    : (installationId: string) => defaultManifestToolLoader(installationId, config);

  const policyMap = buildPolicyMap(config);
  const toolRegistry = getToolRegistry();

  app.post("/plans/draft", async (request, reply) => {
    if (!validateBootstrapHeader(request.headers["x-wp-agent-bootstrap"], config)) {
      return reply
        .code(401)
        .send(errorResponse("PLANS_AUTH_FAILED", "Invalid bootstrap authentication header"));
    }

    const validated = parseDraftPayload(request.body);
    if (!validated.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", validated.error ?? "Invalid payload"));
    }

    const payload = validated.value;

    if (!(await planStore.isPairedInstallation(payload.installationId))) {
      return reply
        .code(404)
        .send(errorResponse("INSTALLATION_NOT_PAIRED", "Installation is not paired"));
    }

    const policy = policyMap[payload.policyPreset];

    const rateViolation = enforceRateLimit({
      limiter: planRateLimiter,
      key: `${payload.installationId}:${payload.wpUserId}:${payload.policyPreset}:plan`,
      policy,
    });
    if (rateViolation) {
      return reply.code(rateViolation.statusCode).send(toPolicyViolationResponse(rateViolation));
    }

    const usedTokensToday = await planStore.sumPlanUsageTokensForDay({
      installationId: payload.installationId,
      wpUserId: payload.wpUserId,
      dayStartIso: getUtcDayStartIso(),
    });

    const budgetViolation = enforceDailyBudget(usedTokensToday, policy);
    if (budgetViolation) {
      return reply.code(budgetViolation.statusCode).send(toPolicyViolationResponse(budgetViolation));
    }

    const skill = await skillStore.getSkill(payload.installationId, payload.skillId);
    if (!skill) {
      return reply
        .code(404)
        .send(errorResponse("SKILL_NOT_FOUND", "Skill does not exist for this installation"));
    }

    const maxSteps = Math.max(1, config.planMaxSteps);
    const maxToolCalls = Math.max(1, config.planMaxToolCalls);
    const maxPages = Math.max(1, config.planMaxPages);
    const maxCostUsd = Math.max(0.01, config.planMaxCostUsd);

    const policyContext: PlanPolicyContext = {
      policyPreset: payload.policyPreset,
      model: selectModelForPolicy(policy),
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
    let llmModel = policyContext.model;

    try {
      const completion = await llmClient.completeChat({
        model: policyContext.model,
        messages: plannerMessages,
        maxTokens: 1100,
      });
      llmRawOutput = completion.content;
      llmUsageTokens = completion.usageTokens;
      llmModel = completion.model;
    } catch (error) {
      request.log.error({ error }, "plan draft llm request failed");
      return reply
        .code(502)
        .send(errorResponse("PLAN_LLM_FAILED", "Planner model request failed"));
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
      manifestToolNames = await manifestToolsLoader(payload.installationId);
    } catch (error) {
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
        estimatedTokensBucket: "low" as const,
        estimatedCostUsdBand: "low" as const,
        estimatedRuntimeSec: 0,
        confidenceBand: "low" as const,
        estimatedCostUsd: 0,
      },
      risk: {
        tier: "LOW" as const,
        score: 0,
        factors: {
          numberOfSteps: 0,
          writeIntensity: 0,
          toolNovelty: 0,
          costRatioToCap: 0,
        },
      },
      gatingIssues: [] as PlanValidationIssue[],
    };

    if (validation.plan) {
      const effectiveMaxCost = Math.min(maxCostUsd, skill.caps.maxCostUsd ?? Number.MAX_SAFE_INTEGER);
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
      installationId: payload.installationId,
      wpUserId: payload.wpUserId,
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
      llmModel,
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
      meta: null,
    });
  });

  app.get("/plans/:planId", async (request, reply) => {
    if (!validateBootstrapHeader(request.headers["x-wp-agent-bootstrap"], config)) {
      return reply
        .code(401)
        .send(errorResponse("PLANS_AUTH_FAILED", "Invalid bootstrap authentication header"));
    }

    const params = request.params as { planId?: string };
    const scope = parsePlanScopeQuery(request.query);

    if (!scope.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid query"));
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
    if (!validateBootstrapHeader(request.headers["x-wp-agent-bootstrap"], config)) {
      return reply
        .code(401)
        .send(errorResponse("PLANS_AUTH_FAILED", "Invalid bootstrap authentication header"));
    }

    const params = request.params as { planId?: string };
    const scope = parsePlanScopePayload(request.body);
    if (!scope.value) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", scope.error ?? "Invalid payload"));
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
}
