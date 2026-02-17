import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { MemoryRunStore } from "../../src/services/runs/store";
import { startRunWorker } from "../../src/services/runs/worker";

function createLogger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

test("run worker leases queued runs and executes outside request lifecycle", async () => {
  const runStore = new MemoryRunStore();
  const installationId = "10101010-1010-4010-8010-101010101010";

  const created = await runStore.createRun({
    runId: randomUUID(),
    installationId,
    wpUserId: 3,
    planId: randomUUID(),
    plannedSteps: 1,
    plannedToolCalls: 1,
    plannedPages: 1,
    inputPayload: {
      mode: "single",
      step_id: "step-1",
      pages: [{ title: "Hello", content: "World" }],
    },
    steps: [{ stepId: "step-1", plannedToolCalls: 1, plannedPages: 1 }],
  });

  let executeCount = 0;
  const runExecutor = {
    async executeRun(runId: string, claimedInstallationId: string) {
      executeCount += 1;
      assert.equal(runId, created.runId);
      assert.equal(claimedInstallationId, installationId);
      await runStore.setRunStatus({
        runId,
        status: "completed",
        finishedAt: new Date().toISOString(),
      });
    },
  };

  const worker = startRunWorker({
    runStore,
    runExecutor,
    logger: createLogger(),
    pollIntervalMs: 10,
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const run = await runStore.getRun(created.runId);
    if (run?.status === "completed") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const updated = await runStore.getRun(created.runId);
  assert.ok(updated);
  assert.equal(updated.status, "completed");
  assert.equal(executeCount, 1);

  const details = await runStore.getRunWithDetails(created.runId);
  assert.ok(details);
  assert.equal(details.events.some((event) => event.eventType === "run_leased"), true);

  worker.stop();
});
