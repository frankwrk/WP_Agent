import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PolicyPreset } from "../policy/policy.schema";
import type { PlanEstimate, PlanRiskScore } from "./estimate";
import type { PlanStatus, PlanLlmContext } from "./plan.contract";
import type { PlanPolicyContext, PlanStepDraft, PlanValidationIssue } from "./plan.validate";

export interface PlanRecord {
  planId: string;
  installationId: string;
  wpUserId: number;
  skillId: string;
  policyPreset: PolicyPreset;
  status: PlanStatus;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStepDraft[];
  estimates: PlanEstimate;
  risk: PlanRiskScore;
  policyContext: PlanPolicyContext;
  planHash: string;
  validationIssues: PlanValidationIssue[];
  llmUsageTokens: number;
  llm: PlanLlmContext;
  createdAt: string;
  updatedAt: string;
}

export interface PlanEventRecord {
  id: string;
  planId: string;
  eventType: "draft" | "validated" | "approved" | "rejected";
  actorType: "system" | "user";
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PlanStore {
  isPairedInstallation(installationId: string): Promise<boolean>;
  createPlan(input: Omit<PlanRecord, "createdAt" | "updatedAt">): Promise<PlanRecord>;
  getPlan(planId: string): Promise<PlanRecord | null>;
  appendPlanEvent(input: Omit<PlanEventRecord, "id" | "createdAt">): Promise<PlanEventRecord>;
  listPlanEvents(planId: string): Promise<PlanEventRecord[]>;
  updatePlanStatus(input: {
    planId: string;
    status: PlanStatus;
    installationId: string;
    wpUserId: number;
  }): Promise<PlanRecord | null>;
  sumPlanUsageTokensForDay(options: {
    installationId: string;
    wpUserId: number;
    dayStartIso: string;
  }): Promise<number>;
}

export class MemoryPlanStore implements PlanStore {
  public readonly pairedInstallations = new Set<string>();

  private readonly plans = new Map<string, PlanRecord>();

  private readonly planEvents = new Map<string, PlanEventRecord[]>();

  async isPairedInstallation(installationId: string): Promise<boolean> {
    return this.pairedInstallations.has(installationId);
  }

  async createPlan(input: Omit<PlanRecord, "createdAt" | "updatedAt">): Promise<PlanRecord> {
    const now = new Date().toISOString();
    const record: PlanRecord = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.plans.set(record.planId, record);
    this.planEvents.set(record.planId, []);
    return record;
  }

  async getPlan(planId: string): Promise<PlanRecord | null> {
    return this.plans.get(planId) ?? null;
  }

  async appendPlanEvent(input: Omit<PlanEventRecord, "id" | "createdAt">): Promise<PlanEventRecord> {
    const event: PlanEventRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    const list = this.planEvents.get(input.planId) ?? [];
    list.push(event);
    this.planEvents.set(input.planId, list);
    return event;
  }

  async listPlanEvents(planId: string): Promise<PlanEventRecord[]> {
    return [...(this.planEvents.get(planId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async updatePlanStatus(input: {
    planId: string;
    status: PlanStatus;
    installationId: string;
    wpUserId: number;
  }): Promise<PlanRecord | null> {
    const existing = this.plans.get(input.planId);
    if (!existing) {
      return null;
    }

    if (existing.installationId !== input.installationId || existing.wpUserId !== input.wpUserId) {
      return null;
    }

    const updated: PlanRecord = {
      ...existing,
      status: input.status,
      updatedAt: new Date().toISOString(),
    };

    this.plans.set(input.planId, updated);
    return updated;
  }

  async sumPlanUsageTokensForDay(options: {
    installationId: string;
    wpUserId: number;
    dayStartIso: string;
  }): Promise<number> {
    const dayStart = new Date(options.dayStartIso).getTime();
    let total = 0;

    for (const plan of this.plans.values()) {
      if (plan.installationId !== options.installationId || plan.wpUserId !== options.wpUserId) {
        continue;
      }

      if (new Date(plan.createdAt).getTime() >= dayStart) {
        total += plan.llmUsageTokens;
      }
    }

    return total;
  }
}

export class PostgresPlanStore implements PlanStore {
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

  async createPlan(input: Omit<PlanRecord, "createdAt" | "updatedAt">): Promise<PlanRecord> {
    const result = await this.pool.query<PlanRow>(
      `
        INSERT INTO plans (
          plan_id,
          installation_id,
          wp_user_id,
          skill_id,
          policy_preset,
          status,
          goal,
          assumptions,
          inputs,
          steps,
          estimates,
          risk,
          policy_context,
          llm_context,
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8::jsonb, $9::jsonb, $10::jsonb,
          $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15,
          $16::jsonb, $17, $18
        )
        RETURNING
          plan_id,
          installation_id,
          wp_user_id,
          skill_id,
          policy_preset,
          status,
          goal,
          assumptions,
          inputs,
          steps,
          estimates,
          risk,
          policy_context,
          llm_context,
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model,
          created_at,
          updated_at
      `,
      [
        input.planId,
        input.installationId,
        input.wpUserId,
        input.skillId,
        input.policyPreset,
        input.status,
        input.goal,
        JSON.stringify(input.assumptions),
        JSON.stringify(input.inputs),
        JSON.stringify(input.steps),
        JSON.stringify(input.estimates),
        JSON.stringify(input.risk),
        JSON.stringify({
          policy_preset: input.policyContext.policyPreset,
          model: input.policyContext.model,
          max_steps: input.policyContext.maxSteps,
          max_tool_calls: input.policyContext.maxToolCalls,
          max_pages: input.policyContext.maxPages,
          max_cost_usd: input.policyContext.maxCostUsd,
        }),
        JSON.stringify({
          selected_model: input.llm.selectedModel,
          task_class: input.llm.taskClass,
          preference: input.llm.preference,
          request_id: input.llm.requestId,
          provider_request_id: input.llm.providerRequestId,
        }),
        input.planHash,
        JSON.stringify(input.validationIssues),
        input.llmUsageTokens,
        input.llm.selectedModel,
      ],
    );

    return mapPlanRow(result.rows[0]);
  }

  async getPlan(planId: string): Promise<PlanRecord | null> {
    const result = await this.pool.query<PlanRow>(
      `
        SELECT
          plan_id,
          installation_id,
          wp_user_id,
          skill_id,
          policy_preset,
          status,
          goal,
          assumptions,
          inputs,
          steps,
          estimates,
          risk,
          policy_context,
          llm_context,
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model,
          created_at,
          updated_at
        FROM plans
        WHERE plan_id = $1
        LIMIT 1
      `,
      [planId],
    );

    return result.rowCount ? mapPlanRow(result.rows[0]) : null;
  }

  async appendPlanEvent(input: Omit<PlanEventRecord, "id" | "createdAt">): Promise<PlanEventRecord> {
    const id = randomUUID();
    const result = await this.pool.query<{
      id: string;
      plan_id: string;
      event_type: "draft" | "validated" | "approved" | "rejected";
      actor_type: "system" | "user";
      actor_id: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `
        INSERT INTO plan_events (
          id,
          plan_id,
          event_type,
          actor_type,
          actor_id,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id, plan_id, event_type, actor_type, actor_id, payload, created_at
      `,
      [
        id,
        input.planId,
        input.eventType,
        input.actorType,
        input.actorId,
        JSON.stringify(input.payload),
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      planId: row.plan_id,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      payload: row.payload ?? {},
      createdAt: row.created_at,
    };
  }

  async listPlanEvents(planId: string): Promise<PlanEventRecord[]> {
    const result = await this.pool.query<{
      id: string;
      plan_id: string;
      event_type: "draft" | "validated" | "approved" | "rejected";
      actor_type: "system" | "user";
      actor_id: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `
        SELECT id, plan_id, event_type, actor_type, actor_id, payload, created_at
        FROM plan_events
        WHERE plan_id = $1
        ORDER BY created_at ASC
      `,
      [planId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      eventType: row.event_type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      payload: row.payload ?? {},
      createdAt: row.created_at,
    }));
  }

  async updatePlanStatus(input: {
    planId: string;
    status: PlanStatus;
    installationId: string;
    wpUserId: number;
  }): Promise<PlanRecord | null> {
    const result = await this.pool.query<PlanRow>(
      `
        UPDATE plans
        SET
          status = $2,
          updated_at = NOW()
        WHERE plan_id = $1
          AND installation_id = $3
          AND wp_user_id = $4
        RETURNING
          plan_id,
          installation_id,
          wp_user_id,
          skill_id,
          policy_preset,
          status,
          goal,
          assumptions,
          inputs,
          steps,
          estimates,
          risk,
          policy_context,
          llm_context,
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model,
          created_at,
          updated_at
      `,
      [input.planId, input.status, input.installationId, input.wpUserId],
    );

    return result.rowCount ? mapPlanRow(result.rows[0]) : null;
  }

  async sumPlanUsageTokensForDay(options: {
    installationId: string;
    wpUserId: number;
    dayStartIso: string;
  }): Promise<number> {
    const result = await this.pool.query<{ total: string | null }>(
      `
        SELECT COALESCE(SUM(llm_usage_tokens), 0)::text AS total
        FROM plans
        WHERE installation_id = $1
          AND wp_user_id = $2
          AND created_at >= $3::timestamptz
      `,
      [options.installationId, options.wpUserId, options.dayStartIso],
    );

    return Number.parseInt(result.rows[0]?.total ?? "0", 10) || 0;
  }
}

interface PlanRow {
  plan_id: string;
  installation_id: string;
  wp_user_id: number | string;
  skill_id: string;
  policy_preset: PolicyPreset;
  status: PlanStatus;
  goal: string;
  assumptions: string[];
  inputs: Record<string, unknown>;
  steps: PlanStepDraft[];
  estimates: PlanEstimate;
  risk: PlanRiskScore;
  policy_context: Record<string, unknown>;
  llm_context?: Record<string, unknown>;
  plan_hash: string;
  validation_issues: PlanValidationIssue[];
  llm_usage_tokens: number;
  llm_model: string;
  created_at: string;
  updated_at: string;
}

function mapPlanRow(row: PlanRow): PlanRecord {
  const wpUserId = Number.parseInt(String(row.wp_user_id), 10);

  const llmContext = row.llm_context ?? {};
  const selectedModel = String(
    llmContext.selected_model
      ?? llmContext.model
      ?? row.llm_model
      ?? row.policy_context?.model
      ?? "",
  );

  const taskClass = String(llmContext.task_class ?? "planning");
  const preference = String(llmContext.preference ?? "balanced");
  const requestId = String(llmContext.request_id ?? "");
  const providerRequestIdRaw = llmContext.provider_request_id;
  const providerRequestId =
    providerRequestIdRaw === undefined || providerRequestIdRaw === null
      ? undefined
      : String(providerRequestIdRaw);

  return {
    planId: row.plan_id,
    installationId: row.installation_id,
    wpUserId: Number.isFinite(wpUserId) ? wpUserId : 0,
    skillId: row.skill_id,
    policyPreset: row.policy_preset,
    status: row.status,
    goal: row.goal,
    assumptions: row.assumptions ?? [],
    inputs: row.inputs ?? {},
    steps: row.steps ?? [],
    estimates: row.estimates,
    risk: row.risk,
    policyContext: {
      policyPreset: String(row.policy_context?.policy_preset ?? row.policy_preset) as PolicyPreset,
      model: String(row.policy_context?.model ?? selectedModel),
      maxSteps: Number.parseInt(String(row.policy_context?.max_steps ?? "0"), 10) || 0,
      maxToolCalls:
        Number.parseInt(String(row.policy_context?.max_tool_calls ?? "0"), 10) || 0,
      maxPages: Number.parseInt(String(row.policy_context?.max_pages ?? "0"), 10) || 0,
      maxCostUsd: Number.parseFloat(String(row.policy_context?.max_cost_usd ?? "0")) || 0,
    },
    planHash: row.plan_hash,
    validationIssues: row.validation_issues ?? [],
    llmUsageTokens: row.llm_usage_tokens,
    llm: {
      selectedModel,
      taskClass:
        taskClass === "chat_fast"
        || taskClass === "chat_balanced"
        || taskClass === "chat_quality"
        || taskClass === "planning"
        || taskClass === "code"
        || taskClass === "summarize"
        || taskClass === "extract_json"
          ? taskClass
          : "planning",
      preference:
        preference === "cheap" || preference === "balanced" || preference === "quality"
          ? preference
          : "balanced",
      requestId,
      providerRequestId,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
