"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresPlanStore = exports.MemoryPlanStore = void 0;
const node_crypto_1 = require("node:crypto");
class MemoryPlanStore {
    pairedInstallations = new Set();
    plans = new Map();
    planEvents = new Map();
    async isPairedInstallation(installationId) {
        return this.pairedInstallations.has(installationId);
    }
    async createPlan(input) {
        const now = new Date().toISOString();
        const record = {
            ...input,
            createdAt: now,
            updatedAt: now,
        };
        this.plans.set(record.planId, record);
        this.planEvents.set(record.planId, []);
        return record;
    }
    async getPlan(planId) {
        return this.plans.get(planId) ?? null;
    }
    async appendPlanEvent(input) {
        const event = {
            ...input,
            id: (0, node_crypto_1.randomUUID)(),
            createdAt: new Date().toISOString(),
        };
        const list = this.planEvents.get(input.planId) ?? [];
        list.push(event);
        this.planEvents.set(input.planId, list);
        return event;
    }
    async listPlanEvents(planId) {
        return [...(this.planEvents.get(planId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async updatePlanStatus(input) {
        const existing = this.plans.get(input.planId);
        if (!existing) {
            return null;
        }
        if (existing.installationId !== input.installationId || existing.wpUserId !== input.wpUserId) {
            return null;
        }
        const updated = {
            ...existing,
            status: input.status,
            updatedAt: new Date().toISOString(),
        };
        this.plans.set(input.planId, updated);
        return updated;
    }
    async sumPlanUsageTokensForDay(options) {
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
exports.MemoryPlanStore = MemoryPlanStore;
class PostgresPlanStore {
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
    async createPlan(input) {
        const result = await this.pool.query(`
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
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8::jsonb, $9::jsonb, $10::jsonb,
          $11::jsonb, $12::jsonb, $13::jsonb, $14,
          $15::jsonb, $16, $17
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
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model,
          created_at,
          updated_at
      `, [
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
            input.planHash,
            JSON.stringify(input.validationIssues),
            input.llmUsageTokens,
            input.llmModel,
        ]);
        return mapPlanRow(result.rows[0]);
    }
    async getPlan(planId) {
        const result = await this.pool.query(`
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
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model,
          created_at,
          updated_at
        FROM plans
        WHERE plan_id = $1
        LIMIT 1
      `, [planId]);
        return result.rowCount ? mapPlanRow(result.rows[0]) : null;
    }
    async appendPlanEvent(input) {
        const id = (0, node_crypto_1.randomUUID)();
        const result = await this.pool.query(`
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
      `, [
            id,
            input.planId,
            input.eventType,
            input.actorType,
            input.actorId,
            JSON.stringify(input.payload),
        ]);
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
    async listPlanEvents(planId) {
        const result = await this.pool.query(`
        SELECT id, plan_id, event_type, actor_type, actor_id, payload, created_at
        FROM plan_events
        WHERE plan_id = $1
        ORDER BY created_at ASC
      `, [planId]);
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
    async updatePlanStatus(input) {
        const result = await this.pool.query(`
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
          plan_hash,
          validation_issues,
          llm_usage_tokens,
          llm_model,
          created_at,
          updated_at
      `, [input.planId, input.status, input.installationId, input.wpUserId]);
        return result.rowCount ? mapPlanRow(result.rows[0]) : null;
    }
    async sumPlanUsageTokensForDay(options) {
        const result = await this.pool.query(`
        SELECT COALESCE(SUM(llm_usage_tokens), 0)::text AS total
        FROM plans
        WHERE installation_id = $1
          AND wp_user_id = $2
          AND created_at >= $3::timestamptz
      `, [options.installationId, options.wpUserId, options.dayStartIso]);
        return Number.parseInt(result.rows[0]?.total ?? "0", 10) || 0;
    }
}
exports.PostgresPlanStore = PostgresPlanStore;
function mapPlanRow(row) {
    return {
        planId: row.plan_id,
        installationId: row.installation_id,
        wpUserId: row.wp_user_id,
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
            policyPreset: String(row.policy_context?.policy_preset ?? row.policy_preset),
            model: String(row.policy_context?.model ?? row.llm_model ?? ""),
            maxSteps: Number.parseInt(String(row.policy_context?.max_steps ?? "0"), 10) || 0,
            maxToolCalls: Number.parseInt(String(row.policy_context?.max_tool_calls ?? "0"), 10) || 0,
            maxPages: Number.parseInt(String(row.policy_context?.max_pages ?? "0"), 10) || 0,
            maxCostUsd: Number.parseFloat(String(row.policy_context?.max_cost_usd ?? "0")) || 0,
        },
        planHash: row.plan_hash,
        validationIssues: row.validation_issues ?? [],
        llmUsageTokens: row.llm_usage_tokens,
        llmModel: row.llm_model,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
