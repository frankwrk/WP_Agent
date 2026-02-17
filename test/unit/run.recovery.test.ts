import assert from "node:assert/strict";
import test from "node:test";
import { recoverStaleActiveRuns } from "../../src/services/runs/recovery";
import { MemoryRunStore } from "../../src/services/runs/store";

function createLogger() {
  return {
    info: () => undefined,
    error: () => undefined,
  };
}

test("recoverStaleActiveRuns marks stale active runs as failed and appends audit event", async () => {
  const runStore = new MemoryRunStore();
  const installationId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";
  const stepId = "33333333-3333-4333-8333-333333333333";

  await runStore.createRun({
    runId,
    installationId,
    wpUserId: 7,
    planId: "44444444-4444-4444-8444-444444444444",
    plannedSteps: 1,
    plannedToolCalls: 1,
    plannedPages: 10,
    inputPayload: {
      mode: "bulk",
      step_id: stepId,
      pages: [{ title: "A" }],
    },
    steps: [{ stepId, plannedToolCalls: 1, plannedPages: 10 }],
  });

  await runStore.setRunStatus({
    runId,
    status: "running",
    startedAt: "2026-02-17T10:00:00.000Z",
  });
  await runStore.setRunStepStatus({
    runId,
    stepId,
    status: "running",
    startedAt: "2026-02-17T10:00:00.000Z",
  });

  const recovered = await recoverStaleActiveRuns({
    runStore,
    logger: createLogger(),
    staleMinutes: 15,
    now: () => new Date("2026-02-17T10:20:00.000Z"),
  });

  assert.equal(recovered, 1);

  const run = await runStore.getRun(runId);
  assert.ok(run);
  assert.equal(run.status, "failed");
  assert.equal(run.errorCode, "RUN_EXECUTION_ABORTED");

  const details = await runStore.getRunWithDetails(runId);
  assert.ok(details);
  assert.equal(details.steps[0]?.status, "failed");
  assert.equal(details.steps[0]?.errorCode, "RUN_EXECUTION_ABORTED");
  assert.equal(
    details.events.some((event) => event.eventType === "run_recovered_failed"),
    true,
  );
});

test("recoverStaleActiveRuns leaves fresh active runs untouched", async () => {
  const runStore = new MemoryRunStore();
  const installationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const stepId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  await runStore.createRun({
    runId,
    installationId,
    wpUserId: 9,
    planId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    plannedSteps: 1,
    plannedToolCalls: 1,
    plannedPages: 1,
    inputPayload: {
      mode: "single",
      step_id: stepId,
      pages: [{ title: "B" }],
    },
    steps: [{ stepId, plannedToolCalls: 1, plannedPages: 1 }],
  });

  await runStore.setRunStatus({
    runId,
    status: "running",
    startedAt: "2026-02-17T10:18:00.000Z",
  });

  const recovered = await recoverStaleActiveRuns({
    runStore,
    logger: createLogger(),
    staleMinutes: 15,
    now: () => new Date("2026-02-17T10:20:00.000Z"),
  });

  assert.equal(recovered, 0);
  const run = await runStore.getRun(runId);
  assert.ok(run);
  assert.equal(run.status, "running");
});

test("recoverStaleActiveRuns uses created_at when started_at is missing", async () => {
  const runStore = new MemoryRunStore();
  const installationId = "abababab-abab-4aba-8aba-abababababab";
  const runId = "cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd";
  const stepId = "efefefef-efef-4efe-8efe-efefefefefef";

  await runStore.createRun({
    runId,
    installationId,
    wpUserId: 5,
    planId: "11111111-2222-4333-8444-555555555555",
    plannedSteps: 1,
    plannedToolCalls: 1,
    plannedPages: 1,
    inputPayload: {
      mode: "single",
      step_id: stepId,
      pages: [{ title: "C" }],
    },
    steps: [{ stepId, plannedToolCalls: 1, plannedPages: 1 }],
  });

  const recovered = await recoverStaleActiveRuns({
    runStore,
    logger: createLogger(),
    staleMinutes: 15,
    now: () => new Date("2026-02-17T10:20:00.000Z"),
  });

  assert.equal(recovered, 1);
  const run = await runStore.getRun(runId);
  assert.ok(run);
  assert.equal(run.status, "failed");
  assert.equal(run.errorCode, "RUN_EXECUTION_ABORTED");
});
