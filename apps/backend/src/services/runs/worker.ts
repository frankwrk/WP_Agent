import type { RunStore } from "./store";

interface WorkerLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export interface RunWorkerOptions {
  runStore: RunStore;
  runExecutor: {
    executeRun(runId: string, installationId: string): Promise<void>;
  };
  logger: WorkerLogger;
  pollIntervalMs: number;
}

export interface RunWorkerHandle {
  stop(): void;
}

export function startRunWorker(options: RunWorkerOptions): RunWorkerHandle {
  const pollIntervalMs = Math.max(100, Math.floor(options.pollIntervalMs));
  let stopped = false;
  let ticking = false;

  const tick = async () => {
    if (stopped || ticking) {
      return;
    }
    ticking = true;

    try {
      for (;;) {
        if (stopped) {
          break;
        }

        const claimed = await options.runStore.claimNextQueuedRun();
        if (!claimed) {
          break;
        }

        await options.runStore.appendRunEvent({
          runId: claimed.runId,
          eventType: "run_leased",
          payload: {
            worker: "in_process",
          },
        });

        try {
          await options.runExecutor.executeRun(claimed.runId, claimed.installationId);
        } catch (error) {
          options.logger.error(
            { error, runId: claimed.runId },
            "run worker executeRun failed",
          );
        }
      }
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, pollIntervalMs);
  timer.unref();

  void tick();
  options.logger.info({ pollIntervalMs }, "run worker started");

  return {
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      clearInterval(timer);
      options.logger.info({}, "run worker stopped");
    },
  };
}
