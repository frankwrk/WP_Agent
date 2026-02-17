import type { RunStore } from "./store";

interface RecoveryLogger {
  info(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export interface RecoverStaleRunsOptions {
  runStore: RunStore;
  logger: RecoveryLogger;
  staleMinutes: number;
  maxRuns?: number;
  now?: () => Date;
}

const RUN_EXECUTION_ABORTED = "RUN_EXECUTION_ABORTED";

export async function recoverStaleActiveRuns(options: RecoverStaleRunsOptions): Promise<number> {
  const now = options.now ? options.now() : new Date();
  const staleMinutes = Math.max(1, Math.floor(options.staleMinutes));
  const cutoffIso = new Date(now.getTime() - staleMinutes * 60 * 1000).toISOString();
  const staleRuns = await options.runStore.listStaleActiveRuns({
    cutoffIso,
    limit: options.maxRuns ?? 200,
  });

  if (staleRuns.length === 0) {
    options.logger.info({ staleMinutes, cutoffIso }, "run recovery found no stale active runs");
    return 0;
  }

  for (const staleRun of staleRuns) {
    const finishedAt = now.toISOString();
    const message = `Run marked failed during startup recovery after stale ${staleRun.status} state`;

    await options.runStore.setActiveStepsFailed({
      runId: staleRun.runId,
      errorCode: RUN_EXECUTION_ABORTED,
      errorMessage: message,
      finishedAt,
    });
    await options.runStore.setRunStatus({
      runId: staleRun.runId,
      status: "failed",
      errorCode: RUN_EXECUTION_ABORTED,
      errorMessage: message,
      finishedAt,
    });
    await options.runStore.appendRunEvent({
      runId: staleRun.runId,
      eventType: "run_recovered_failed",
      payload: {
        action: "marked_failed",
        code: RUN_EXECUTION_ABORTED,
        message,
        previous_status: staleRun.status,
        stale_minutes_threshold: staleMinutes,
      },
    });
  }

  options.logger.info(
    { recoveredRuns: staleRuns.length, staleMinutes, cutoffIso },
    "run recovery marked stale active runs as failed",
  );
  return staleRuns.length;
}
