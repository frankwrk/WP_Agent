"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresRunStore = exports.MemoryRunStore = void 0;
const node_crypto_1 = require("node:crypto");
class MemoryRunStore {
    runs = new Map();
    steps = new Map();
    events = new Map();
    rollbacks = new Map();
    async createRun(input) {
        const now = new Date().toISOString();
        const run = {
            runId: input.runId,
            installationId: input.installationId,
            wpUserId: input.wpUserId,
            planId: input.planId,
            status: "queued",
            plannedSteps: input.plannedSteps,
            plannedToolCalls: input.plannedToolCalls,
            plannedPages: input.plannedPages,
            actualToolCalls: 0,
            actualPages: 0,
            errorCode: null,
            errorMessage: null,
            rollbackAvailable: false,
            inputPayload: input.inputPayload,
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            finishedAt: null,
        };
        this.runs.set(run.runId, run);
        this.steps.set(run.runId, input.steps.map((step) => ({
            runId: run.runId,
            stepId: step.stepId,
            status: "queued",
            plannedToolCalls: step.plannedToolCalls,
            plannedPages: step.plannedPages,
            actualToolCalls: 0,
            actualPages: 0,
            errorCode: null,
            errorMessage: null,
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            finishedAt: null,
        })));
        this.events.set(run.runId, []);
        this.rollbacks.set(run.runId, []);
        return run;
    }
    async getRun(runId) {
        return this.runs.get(runId) ?? null;
    }
    async getRunWithDetails(runId) {
        const run = this.runs.get(runId);
        if (!run) {
            return null;
        }
        return {
            run,
            steps: [...(this.steps.get(runId) ?? [])],
            events: [...(this.events.get(runId) ?? [])],
            rollbacks: [...(this.rollbacks.get(runId) ?? [])],
        };
    }
    async getActiveRunForInstallation(installationId) {
        const active = [...this.runs.values()]
            .filter((run) => run.installationId === installationId
            && (run.status === "queued" || run.status === "running" || run.status === "rolling_back"))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return active ?? null;
    }
    async setRunStatus(input) {
        const existing = this.runs.get(input.runId);
        if (!existing) {
            return null;
        }
        const updated = {
            ...existing,
            status: input.status,
            errorCode: input.errorCode ?? existing.errorCode,
            errorMessage: input.errorMessage ?? existing.errorMessage,
            startedAt: input.startedAt === undefined ? existing.startedAt : input.startedAt,
            finishedAt: input.finishedAt === undefined ? existing.finishedAt : input.finishedAt,
            updatedAt: new Date().toISOString(),
        };
        this.runs.set(input.runId, updated);
        return updated;
    }
    async setRunCounts(input) {
        const existing = this.runs.get(input.runId);
        if (!existing) {
            return null;
        }
        const updated = {
            ...existing,
            actualToolCalls: input.actualToolCalls,
            actualPages: input.actualPages,
            updatedAt: new Date().toISOString(),
        };
        this.runs.set(input.runId, updated);
        return updated;
    }
    async setRunRollbackAvailable(runId, value) {
        const existing = this.runs.get(runId);
        if (!existing) {
            return;
        }
        this.runs.set(runId, {
            ...existing,
            rollbackAvailable: value,
            updatedAt: new Date().toISOString(),
        });
    }
    async setRunStepStatus(input) {
        const steps = this.steps.get(input.runId) ?? [];
        const index = steps.findIndex((step) => step.stepId === input.stepId);
        if (index < 0) {
            return;
        }
        steps[index] = {
            ...steps[index],
            status: input.status,
            actualToolCalls: input.actualToolCalls ?? steps[index].actualToolCalls,
            actualPages: input.actualPages ?? steps[index].actualPages,
            errorCode: input.errorCode === undefined ? steps[index].errorCode : input.errorCode,
            errorMessage: input.errorMessage === undefined ? steps[index].errorMessage : input.errorMessage,
            startedAt: input.startedAt === undefined ? steps[index].startedAt : input.startedAt,
            finishedAt: input.finishedAt === undefined ? steps[index].finishedAt : input.finishedAt,
            updatedAt: new Date().toISOString(),
        };
        this.steps.set(input.runId, steps);
    }
    async appendRunEvent(input) {
        const event = {
            id: (0, node_crypto_1.randomUUID)(),
            runId: input.runId,
            eventType: input.eventType,
            payload: input.payload ?? {},
            createdAt: new Date().toISOString(),
        };
        const list = this.events.get(input.runId) ?? [];
        list.push(event);
        this.events.set(input.runId, list);
        return event;
    }
    async addRunRollbacks(input) {
        const now = new Date().toISOString();
        const list = this.rollbacks.get(input.runId) ?? [];
        for (const handle of input.handles) {
            if (list.some((existing) => existing.handleId === handle.handleId)) {
                continue;
            }
            list.push({
                id: (0, node_crypto_1.randomUUID)(),
                runId: input.runId,
                handleId: handle.handleId,
                kind: handle.kind,
                status: "pending",
                payload: handle.payload ?? {},
                error: null,
                createdAt: now,
                updatedAt: now,
                appliedAt: null,
            });
        }
        this.rollbacks.set(input.runId, list);
    }
    async setRunRollbackStatus(input) {
        const list = this.rollbacks.get(input.runId) ?? [];
        const index = list.findIndex((item) => item.handleId === input.handleId);
        if (index < 0) {
            return;
        }
        list[index] = {
            ...list[index],
            status: input.status,
            error: input.error === undefined ? list[index].error : input.error,
            appliedAt: input.appliedAt === undefined ? list[index].appliedAt : input.appliedAt,
            updatedAt: new Date().toISOString(),
        };
        this.rollbacks.set(input.runId, list);
    }
    async listPendingRollbacks(runId) {
        const list = this.rollbacks.get(runId) ?? [];
        return list.filter((item) => item.status === "pending");
    }
}
exports.MemoryRunStore = MemoryRunStore;
function toInt(value) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}
function mapRunRow(row) {
    return {
        runId: row.run_id,
        installationId: row.installation_id,
        wpUserId: toInt(row.wp_user_id),
        planId: row.plan_id,
        status: row.status,
        plannedSteps: toInt(row.planned_steps),
        plannedToolCalls: toInt(row.planned_tool_calls),
        plannedPages: toInt(row.planned_pages),
        actualToolCalls: toInt(row.actual_tool_calls),
        actualPages: toInt(row.actual_pages),
        errorCode: row.error_code,
        errorMessage: row.error_message,
        rollbackAvailable: Boolean(row.rollback_available),
        inputPayload: row.input_payload ?? {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
    };
}
class PostgresRunStore {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async createRun(input) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const runResult = await client.query(`
          INSERT INTO runs (
            run_id,
            installation_id,
            wp_user_id,
            plan_id,
            status,
            planned_steps,
            planned_tool_calls,
            planned_pages,
            input_payload
          )
          VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8::jsonb)
          RETURNING
            run_id,
            installation_id,
            wp_user_id,
            plan_id,
            status,
            planned_steps,
            planned_tool_calls,
            planned_pages,
            actual_tool_calls,
            actual_pages,
            error_code,
            error_message,
            rollback_available,
            input_payload,
            created_at,
            updated_at,
            started_at,
            finished_at
        `, [
                input.runId,
                input.installationId,
                input.wpUserId,
                input.planId,
                input.plannedSteps,
                input.plannedToolCalls,
                input.plannedPages,
                JSON.stringify(input.inputPayload),
            ]);
            for (const step of input.steps) {
                await client.query(`
            INSERT INTO run_steps (
              run_id,
              step_id,
              status,
              planned_tool_calls,
              planned_pages
            )
            VALUES ($1, $2, 'queued', $3, $4)
          `, [input.runId, step.stepId, step.plannedToolCalls, step.plannedPages]);
            }
            await client.query("COMMIT");
            return mapRunRow(runResult.rows[0]);
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getRun(runId) {
        const result = await this.pool.query(`
        SELECT
          run_id,
          installation_id,
          wp_user_id,
          plan_id,
          status,
          planned_steps,
          planned_tool_calls,
          planned_pages,
          actual_tool_calls,
          actual_pages,
          error_code,
          error_message,
          rollback_available,
          input_payload,
          created_at,
          updated_at,
          started_at,
          finished_at
        FROM runs
        WHERE run_id = $1
        LIMIT 1
      `, [runId]);
        return result.rowCount ? mapRunRow(result.rows[0]) : null;
    }
    async getRunWithDetails(runId) {
        const run = await this.getRun(runId);
        if (!run) {
            return null;
        }
        const stepResult = await this.pool.query(`
        SELECT
          run_id,
          step_id,
          status,
          planned_tool_calls,
          planned_pages,
          actual_tool_calls,
          actual_pages,
          error_code,
          error_message,
          created_at,
          updated_at,
          started_at,
          finished_at
        FROM run_steps
        WHERE run_id = $1
        ORDER BY created_at ASC
      `, [runId]);
        const eventResult = await this.pool.query(`
        SELECT id, run_id, event_type, payload, created_at
        FROM run_events
        WHERE run_id = $1
        ORDER BY created_at ASC
      `, [runId]);
        const rollbackResult = await this.pool.query(`
        SELECT
          id,
          run_id,
          handle_id,
          kind,
          status,
          payload,
          error,
          created_at,
          updated_at,
          applied_at
        FROM run_rollbacks
        WHERE run_id = $1
        ORDER BY created_at ASC
      `, [runId]);
        return {
            run,
            steps: stepResult.rows.map((row) => ({
                runId: row.run_id,
                stepId: row.step_id,
                status: row.status,
                plannedToolCalls: toInt(row.planned_tool_calls),
                plannedPages: toInt(row.planned_pages),
                actualToolCalls: toInt(row.actual_tool_calls),
                actualPages: toInt(row.actual_pages),
                errorCode: row.error_code,
                errorMessage: row.error_message,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                startedAt: row.started_at,
                finishedAt: row.finished_at,
            })),
            events: eventResult.rows.map((row) => ({
                id: row.id,
                runId: row.run_id,
                eventType: row.event_type,
                payload: row.payload ?? {},
                createdAt: row.created_at,
            })),
            rollbacks: rollbackResult.rows.map((row) => ({
                id: row.id,
                runId: row.run_id,
                handleId: row.handle_id,
                kind: row.kind,
                status: row.status,
                payload: row.payload ?? {},
                error: row.error,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                appliedAt: row.applied_at,
            })),
        };
    }
    async getActiveRunForInstallation(installationId) {
        const result = await this.pool.query(`
        SELECT
          run_id,
          installation_id,
          wp_user_id,
          plan_id,
          status,
          planned_steps,
          planned_tool_calls,
          planned_pages,
          actual_tool_calls,
          actual_pages,
          error_code,
          error_message,
          rollback_available,
          input_payload,
          created_at,
          updated_at,
          started_at,
          finished_at
        FROM runs
        WHERE installation_id = $1
          AND status IN ('queued', 'running', 'rolling_back')
        ORDER BY created_at DESC
        LIMIT 1
      `, [installationId]);
        return result.rowCount ? mapRunRow(result.rows[0]) : null;
    }
    async setRunStatus(input) {
        const result = await this.pool.query(`
        UPDATE runs
        SET
          status = $2,
          error_code = COALESCE($3, error_code),
          error_message = COALESCE($4, error_message),
          started_at = CASE WHEN $5::timestamptz IS NULL THEN started_at ELSE $5::timestamptz END,
          finished_at = CASE WHEN $6::timestamptz IS NULL THEN finished_at ELSE $6::timestamptz END,
          updated_at = NOW()
        WHERE run_id = $1
        RETURNING
          run_id,
          installation_id,
          wp_user_id,
          plan_id,
          status,
          planned_steps,
          planned_tool_calls,
          planned_pages,
          actual_tool_calls,
          actual_pages,
          error_code,
          error_message,
          rollback_available,
          input_payload,
          created_at,
          updated_at,
          started_at,
          finished_at
      `, [
            input.runId,
            input.status,
            input.errorCode ?? null,
            input.errorMessage ?? null,
            input.startedAt ?? null,
            input.finishedAt ?? null,
        ]);
        return result.rowCount ? mapRunRow(result.rows[0]) : null;
    }
    async setRunCounts(input) {
        const result = await this.pool.query(`
        UPDATE runs
        SET
          actual_tool_calls = $2,
          actual_pages = $3,
          updated_at = NOW()
        WHERE run_id = $1
        RETURNING
          run_id,
          installation_id,
          wp_user_id,
          plan_id,
          status,
          planned_steps,
          planned_tool_calls,
          planned_pages,
          actual_tool_calls,
          actual_pages,
          error_code,
          error_message,
          rollback_available,
          input_payload,
          created_at,
          updated_at,
          started_at,
          finished_at
      `, [input.runId, input.actualToolCalls, input.actualPages]);
        return result.rowCount ? mapRunRow(result.rows[0]) : null;
    }
    async setRunRollbackAvailable(runId, value) {
        await this.pool.query(`
        UPDATE runs
        SET rollback_available = $2, updated_at = NOW()
        WHERE run_id = $1
      `, [runId, value]);
    }
    async setRunStepStatus(input) {
        await this.pool.query(`
        UPDATE run_steps
        SET
          status = $3,
          actual_tool_calls = COALESCE($4, actual_tool_calls),
          actual_pages = COALESCE($5, actual_pages),
          error_code = CASE WHEN $6::text IS NULL THEN error_code ELSE $6 END,
          error_message = CASE WHEN $7::text IS NULL THEN error_message ELSE $7 END,
          started_at = CASE WHEN $8::timestamptz IS NULL THEN started_at ELSE $8::timestamptz END,
          finished_at = CASE WHEN $9::timestamptz IS NULL THEN finished_at ELSE $9::timestamptz END,
          updated_at = NOW()
        WHERE run_id = $1
          AND step_id = $2
      `, [
            input.runId,
            input.stepId,
            input.status,
            input.actualToolCalls ?? null,
            input.actualPages ?? null,
            input.errorCode ?? null,
            input.errorMessage ?? null,
            input.startedAt ?? null,
            input.finishedAt ?? null,
        ]);
    }
    async appendRunEvent(input) {
        const id = (0, node_crypto_1.randomUUID)();
        const result = await this.pool.query(`
        INSERT INTO run_events (
          id,
          run_id,
          event_type,
          payload
        )
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING id, run_id, event_type, payload, created_at
      `, [id, input.runId, input.eventType, JSON.stringify(input.payload ?? {})]);
        const row = result.rows[0];
        return {
            id: row.id,
            runId: row.run_id,
            eventType: row.event_type,
            payload: row.payload ?? {},
            createdAt: row.created_at,
        };
    }
    async addRunRollbacks(input) {
        for (const handle of input.handles) {
            await this.pool.query(`
          INSERT INTO run_rollbacks (
            id,
            run_id,
            handle_id,
            kind,
            status,
            payload
          )
          VALUES ($1, $2, $3, $4, 'pending', $5::jsonb)
          ON CONFLICT (run_id, handle_id)
          DO NOTHING
        `, [(0, node_crypto_1.randomUUID)(), input.runId, handle.handleId, handle.kind, JSON.stringify(handle.payload ?? {})]);
        }
    }
    async setRunRollbackStatus(input) {
        await this.pool.query(`
        UPDATE run_rollbacks
        SET
          status = $3,
          error = CASE WHEN $4::text IS NULL THEN error ELSE $4 END,
          applied_at = CASE WHEN $5::timestamptz IS NULL THEN applied_at ELSE $5::timestamptz END,
          updated_at = NOW()
        WHERE run_id = $1
          AND handle_id = $2
      `, [input.runId, input.handleId, input.status, input.error ?? null, input.appliedAt ?? null]);
    }
    async listPendingRollbacks(runId) {
        const result = await this.pool.query(`
        SELECT
          id,
          run_id,
          handle_id,
          kind,
          status,
          payload,
          error,
          created_at,
          updated_at,
          applied_at
        FROM run_rollbacks
        WHERE run_id = $1
          AND status = 'pending'
        ORDER BY created_at ASC
      `, [runId]);
        return result.rows.map((row) => ({
            id: row.id,
            runId: row.run_id,
            handleId: row.handle_id,
            kind: row.kind,
            status: row.status,
            payload: row.payload ?? {},
            error: row.error,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            appliedAt: row.applied_at,
        }));
    }
}
exports.PostgresRunStore = PostgresRunStore;
