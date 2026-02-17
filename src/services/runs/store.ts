import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "rolling_back"
  | "rolled_back"
  | "rollback_failed";

export type RunStepStatus = "queued" | "running" | "completed" | "failed";
export type RunRollbackStatus = "pending" | "applied" | "failed";

export interface RunRecord {
  runId: string;
  installationId: string;
  wpUserId: number;
  planId: string;
  status: RunStatus;
  plannedSteps: number;
  plannedToolCalls: number;
  plannedPages: number;
  actualToolCalls: number;
  actualPages: number;
  errorCode: string | null;
  errorMessage: string | null;
  rollbackAvailable: boolean;
  inputPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunStepRecord {
  runId: string;
  stepId: string;
  status: RunStepStatus;
  plannedToolCalls: number;
  plannedPages: number;
  actualToolCalls: number;
  actualPages: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunEventRecord {
  id: string;
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RunRollbackRecord {
  id: string;
  runId: string;
  handleId: string;
  kind: string;
  status: RunRollbackStatus;
  payload: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
}

export interface RunCreateStepInput {
  stepId: string;
  plannedToolCalls: number;
  plannedPages: number;
}

export interface RunCreateInput {
  runId: string;
  installationId: string;
  wpUserId: number;
  planId: string;
  plannedSteps: number;
  plannedToolCalls: number;
  plannedPages: number;
  inputPayload: Record<string, unknown>;
  steps: RunCreateStepInput[];
}

export interface RunWithDetails {
  run: RunRecord;
  steps: RunStepRecord[];
  events: RunEventRecord[];
  rollbacks: RunRollbackRecord[];
}

export interface RunStore {
  createRun(input: RunCreateInput): Promise<RunRecord>;
  getRun(runId: string): Promise<RunRecord | null>;
  getRunWithDetails(runId: string): Promise<RunWithDetails | null>;
  claimNextQueuedRun(): Promise<RunRecord | null>;
  getActiveRunForInstallation(installationId: string): Promise<RunRecord | null>;
  setRunStatus(input: {
    runId: string;
    status: RunStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }): Promise<RunRecord | null>;
  setRunCounts(input: {
    runId: string;
    actualToolCalls: number;
    actualPages: number;
  }): Promise<RunRecord | null>;
  setRunRollbackAvailable(runId: string, value: boolean): Promise<void>;
  setRunStepStatus(input: {
    runId: string;
    stepId: string;
    status: RunStepStatus;
    actualToolCalls?: number;
    actualPages?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }): Promise<void>;
  setActiveStepsFailed(input: {
    runId: string;
    errorCode: string;
    errorMessage: string;
    finishedAt: string;
  }): Promise<void>;
  appendRunEvent(input: {
    runId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }): Promise<RunEventRecord>;
  addRunRollbacks(input: {
    runId: string;
    handles: Array<{
      handleId: string;
      kind: string;
      payload?: Record<string, unknown>;
    }>;
  }): Promise<void>;
  setRunRollbackStatus(input: {
    runId: string;
    handleId: string;
    status: RunRollbackStatus;
    error?: string | null;
    appliedAt?: string | null;
  }): Promise<void>;
  listPendingRollbacks(runId: string): Promise<RunRollbackRecord[]>;
  listStaleActiveRuns(input: {
    cutoffIso: string;
    limit?: number;
  }): Promise<RunRecord[]>;
}

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>();

  private readonly steps = new Map<string, RunStepRecord[]>();

  private readonly events = new Map<string, RunEventRecord[]>();

  private readonly rollbacks = new Map<string, RunRollbackRecord[]>();

  async createRun(input: RunCreateInput): Promise<RunRecord> {
    const now = new Date().toISOString();
    const run: RunRecord = {
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
    this.steps.set(
      run.runId,
      input.steps.map((step) => ({
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
      })),
    );
    this.events.set(run.runId, []);
    this.rollbacks.set(run.runId, []);

    return run;
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async getRunWithDetails(runId: string): Promise<RunWithDetails | null> {
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

  async claimNextQueuedRun(): Promise<RunRecord | null> {
    const now = new Date().toISOString();
    const queued = [...this.runs.values()]
      .filter((run) => run.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    if (!queued) {
      return null;
    }

    const claimed: RunRecord = {
      ...queued,
      status: "running",
      startedAt: queued.startedAt ?? now,
      updatedAt: now,
    };
    this.runs.set(claimed.runId, claimed);
    return claimed;
  }

  async getActiveRunForInstallation(installationId: string): Promise<RunRecord | null> {
    const active = [...this.runs.values()]
      .filter(
        (run) =>
          run.installationId === installationId
          && (run.status === "queued" || run.status === "running" || run.status === "rolling_back"),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    return active ?? null;
  }

  async setRunStatus(input: {
    runId: string;
    status: RunStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }): Promise<RunRecord | null> {
    const existing = this.runs.get(input.runId);
    if (!existing) {
      return null;
    }

    const updated: RunRecord = {
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

  async setRunCounts(input: {
    runId: string;
    actualToolCalls: number;
    actualPages: number;
  }): Promise<RunRecord | null> {
    const existing = this.runs.get(input.runId);
    if (!existing) {
      return null;
    }

    const updated: RunRecord = {
      ...existing,
      actualToolCalls: input.actualToolCalls,
      actualPages: input.actualPages,
      updatedAt: new Date().toISOString(),
    };

    this.runs.set(input.runId, updated);
    return updated;
  }

  async setRunRollbackAvailable(runId: string, value: boolean): Promise<void> {
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

  async setRunStepStatus(input: {
    runId: string;
    stepId: string;
    status: RunStepStatus;
    actualToolCalls?: number;
    actualPages?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }): Promise<void> {
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
      errorMessage:
        input.errorMessage === undefined ? steps[index].errorMessage : input.errorMessage,
      startedAt: input.startedAt === undefined ? steps[index].startedAt : input.startedAt,
      finishedAt: input.finishedAt === undefined ? steps[index].finishedAt : input.finishedAt,
      updatedAt: new Date().toISOString(),
    };

    this.steps.set(input.runId, steps);
  }

  async setActiveStepsFailed(input: {
    runId: string;
    errorCode: string;
    errorMessage: string;
    finishedAt: string;
  }): Promise<void> {
    const steps = this.steps.get(input.runId) ?? [];
    const now = new Date().toISOString();

    for (let i = 0; i < steps.length; i += 1) {
      if (steps[i].status !== "queued" && steps[i].status !== "running") {
        continue;
      }

      steps[i] = {
        ...steps[i],
        status: "failed",
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt: input.finishedAt,
        updatedAt: now,
      };
    }

    this.steps.set(input.runId, steps);
  }

  async appendRunEvent(input: {
    runId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }): Promise<RunEventRecord> {
    const event: RunEventRecord = {
      id: randomUUID(),
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

  async addRunRollbacks(input: {
    runId: string;
    handles: Array<{
      handleId: string;
      kind: string;
      payload?: Record<string, unknown>;
    }>;
  }): Promise<void> {
    const now = new Date().toISOString();
    const list = this.rollbacks.get(input.runId) ?? [];

    for (const handle of input.handles) {
      if (list.some((existing) => existing.handleId === handle.handleId)) {
        continue;
      }

      list.push({
        id: randomUUID(),
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

  async setRunRollbackStatus(input: {
    runId: string;
    handleId: string;
    status: RunRollbackStatus;
    error?: string | null;
    appliedAt?: string | null;
  }): Promise<void> {
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

  async listPendingRollbacks(runId: string): Promise<RunRollbackRecord[]> {
    const list = this.rollbacks.get(runId) ?? [];
    return list.filter((item) => item.status === "pending");
  }

  async listStaleActiveRuns(input: { cutoffIso: string; limit?: number }): Promise<RunRecord[]> {
    const cutoff = new Date(input.cutoffIso).getTime();
    const limit = Math.max(1, input.limit ?? 200);

    return [...this.runs.values()]
      .filter((run) => run.status === "queued" || run.status === "running" || run.status === "rolling_back")
      .filter((run) => {
        const candidate = run.startedAt ?? run.createdAt;
        return new Date(candidate).getTime() < cutoff;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }
}

interface RunRow {
  run_id: string;
  installation_id: string;
  wp_user_id: number | string;
  plan_id: string;
  status: RunStatus;
  planned_steps: number | string;
  planned_tool_calls: number | string;
  planned_pages: number | string;
  actual_tool_calls: number | string;
  actual_pages: number | string;
  error_code: string | null;
  error_message: string | null;
  rollback_available: boolean;
  input_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

function toInt(value: number | string): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRunRow(row: RunRow): RunRecord {
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

export class PostgresRunStore implements RunStore {
  constructor(private readonly pool: Pool) {}

  async createRun(input: RunCreateInput): Promise<RunRecord> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const runResult = await client.query<RunRow>(
        `
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
        `,
        [
          input.runId,
          input.installationId,
          input.wpUserId,
          input.planId,
          input.plannedSteps,
          input.plannedToolCalls,
          input.plannedPages,
          JSON.stringify(input.inputPayload),
        ],
      );

      for (const step of input.steps) {
        await client.query(
          `
            INSERT INTO run_steps (
              run_id,
              step_id,
              status,
              planned_tool_calls,
              planned_pages
            )
            VALUES ($1, $2, 'queued', $3, $4)
          `,
          [input.runId, step.stepId, step.plannedToolCalls, step.plannedPages],
        );
      }

      await client.query("COMMIT");
      return mapRunRow(runResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const result = await this.pool.query<RunRow>(
      `
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
      `,
      [runId],
    );

    return result.rowCount ? mapRunRow(result.rows[0]) : null;
  }

  async getRunWithDetails(runId: string): Promise<RunWithDetails | null> {
    const run = await this.getRun(runId);
    if (!run) {
      return null;
    }

    const stepResult = await this.pool.query<{
      run_id: string;
      step_id: string;
      status: RunStepStatus;
      planned_tool_calls: number | string;
      planned_pages: number | string;
      actual_tool_calls: number | string;
      actual_pages: number | string;
      error_code: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
      started_at: string | null;
      finished_at: string | null;
    }>(
      `
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
      `,
      [runId],
    );

    const eventResult = await this.pool.query<{
      id: string;
      run_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `
        SELECT id, run_id, event_type, payload, created_at
        FROM run_events
        WHERE run_id = $1
        ORDER BY created_at ASC
      `,
      [runId],
    );

    const rollbackResult = await this.pool.query<{
      id: string;
      run_id: string;
      handle_id: string;
      kind: string;
      status: RunRollbackStatus;
      payload: Record<string, unknown>;
      error: string | null;
      created_at: string;
      updated_at: string;
      applied_at: string | null;
    }>(
      `
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
      `,
      [runId],
    );

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

  async claimNextQueuedRun(): Promise<RunRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<RunRow>(
        `
          WITH candidate AS (
            SELECT run_id
            FROM runs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE runs AS r
          SET
            status = 'running',
            started_at = COALESCE(r.started_at, NOW()),
            updated_at = NOW()
          FROM candidate
          WHERE r.run_id = candidate.run_id
          RETURNING
            r.run_id,
            r.installation_id,
            r.wp_user_id,
            r.plan_id,
            r.status,
            r.planned_steps,
            r.planned_tool_calls,
            r.planned_pages,
            r.actual_tool_calls,
            r.actual_pages,
            r.error_code,
            r.error_message,
            r.rollback_available,
            r.input_payload,
            r.created_at,
            r.updated_at,
            r.started_at,
            r.finished_at
        `,
      );
      await client.query("COMMIT");

      if (!result.rowCount) {
        return null;
      }

      return mapRunRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getActiveRunForInstallation(installationId: string): Promise<RunRecord | null> {
    const result = await this.pool.query<RunRow>(
      `
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
      `,
      [installationId],
    );

    return result.rowCount ? mapRunRow(result.rows[0]) : null;
  }

  async setRunStatus(input: {
    runId: string;
    status: RunStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }): Promise<RunRecord | null> {
    const result = await this.pool.query<RunRow>(
      `
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
      `,
      [
        input.runId,
        input.status,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.startedAt ?? null,
        input.finishedAt ?? null,
      ],
    );

    return result.rowCount ? mapRunRow(result.rows[0]) : null;
  }

  async setRunCounts(input: {
    runId: string;
    actualToolCalls: number;
    actualPages: number;
  }): Promise<RunRecord | null> {
    const result = await this.pool.query<RunRow>(
      `
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
      `,
      [input.runId, input.actualToolCalls, input.actualPages],
    );

    return result.rowCount ? mapRunRow(result.rows[0]) : null;
  }

  async setRunRollbackAvailable(runId: string, value: boolean): Promise<void> {
    await this.pool.query(
      `
        UPDATE runs
        SET rollback_available = $2, updated_at = NOW()
        WHERE run_id = $1
      `,
      [runId, value],
    );
  }

  async setRunStepStatus(input: {
    runId: string;
    stepId: string;
    status: RunStepStatus;
    actualToolCalls?: number;
    actualPages?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `
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
      `,
      [
        input.runId,
        input.stepId,
        input.status,
        input.actualToolCalls ?? null,
        input.actualPages ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.startedAt ?? null,
        input.finishedAt ?? null,
      ],
    );
  }

  async setActiveStepsFailed(input: {
    runId: string;
    errorCode: string;
    errorMessage: string;
    finishedAt: string;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE run_steps
        SET
          status = 'failed',
          error_code = $2,
          error_message = $3,
          finished_at = $4::timestamptz,
          updated_at = NOW()
        WHERE run_id = $1
          AND status IN ('queued', 'running')
      `,
      [input.runId, input.errorCode, input.errorMessage, input.finishedAt],
    );
  }

  async appendRunEvent(input: {
    runId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }): Promise<RunEventRecord> {
    const id = randomUUID();
    const result = await this.pool.query<{
      id: string;
      run_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>(
      `
        INSERT INTO run_events (
          id,
          run_id,
          event_type,
          payload
        )
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING id, run_id, event_type, payload, created_at
      `,
      [id, input.runId, input.eventType, JSON.stringify(input.payload ?? {})],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      runId: row.run_id,
      eventType: row.event_type,
      payload: row.payload ?? {},
      createdAt: row.created_at,
    };
  }

  async addRunRollbacks(input: {
    runId: string;
    handles: Array<{
      handleId: string;
      kind: string;
      payload?: Record<string, unknown>;
    }>;
  }): Promise<void> {
    for (const handle of input.handles) {
      await this.pool.query(
        `
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
        `,
        [randomUUID(), input.runId, handle.handleId, handle.kind, JSON.stringify(handle.payload ?? {})],
      );
    }
  }

  async setRunRollbackStatus(input: {
    runId: string;
    handleId: string;
    status: RunRollbackStatus;
    error?: string | null;
    appliedAt?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE run_rollbacks
        SET
          status = $3,
          error = CASE WHEN $4::text IS NULL THEN error ELSE $4 END,
          applied_at = CASE WHEN $5::timestamptz IS NULL THEN applied_at ELSE $5::timestamptz END,
          updated_at = NOW()
        WHERE run_id = $1
          AND handle_id = $2
      `,
      [input.runId, input.handleId, input.status, input.error ?? null, input.appliedAt ?? null],
    );
  }

  async listPendingRollbacks(runId: string): Promise<RunRollbackRecord[]> {
    const result = await this.pool.query<{
      id: string;
      run_id: string;
      handle_id: string;
      kind: string;
      status: RunRollbackStatus;
      payload: Record<string, unknown>;
      error: string | null;
      created_at: string;
      updated_at: string;
      applied_at: string | null;
    }>(
      `
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
      `,
      [runId],
    );

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

  async listStaleActiveRuns(input: {
    cutoffIso: string;
    limit?: number;
  }): Promise<RunRecord[]> {
    const limit = Math.max(1, input.limit ?? 200);
    const result = await this.pool.query<RunRow>(
      `
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
        WHERE status IN ('queued', 'running', 'rolling_back')
          AND COALESCE(started_at, created_at) < $1::timestamptz
        ORDER BY created_at ASC
        LIMIT $2
      `,
      [input.cutoffIso, limit],
    );

    return result.rows.map((row) => mapRunRow(row));
  }
}
