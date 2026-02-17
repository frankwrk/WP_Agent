import assert from "node:assert/strict";
import test from "node:test";
import { MemorySkillStore } from "../../src/services/skills/store";

const INSTALLATION_ID = "0fa33b45-bca8-4f1e-b6fc-a9e2484f2850";

test("idempotent sync no-op keeps skill count and updatedAt stable", async () => {
  const store = new MemorySkillStore();
  store.pairedInstallations.add(INSTALLATION_ID);

  const firstIngestion = await store.createIngestion({
    installationId: INSTALLATION_ID,
    repoUrl: "https://github.com/example/skills",
    commitSha: "d5afdf4",
    ingestionHash: "same-hash",
  });

  await store.replaceSkillSpecs({
    installationId: INSTALLATION_ID,
    ingestionId: firstIngestion.ingestionId,
    specs: [
      {
        skillId: "wp.content.audit",
        version: "1.0.0",
        sourceRepo: "https://github.com/example/skills",
        sourceCommitSha: "d5afdf4",
        sourcePath: "skills/content-audit/skill.json",
        name: "Content Audit",
        description: "Audit content inventory",
        tags: ["seo"],
        inputsSchema: { type: "object", properties: {} },
        outputsSchema: { type: "object", properties: {} },
        toolAllowlist: ["site.get_environment", "content.inventory"],
        caps: { maxPages: 10, maxToolCalls: 5, maxSteps: 3, maxCostUsd: 1 },
        safetyClass: "read",
        deprecated: false,
      },
    ],
  });
  await store.updateIngestionStatus({
    ingestionId: firstIngestion.ingestionId,
    status: "succeeded",
  });

  const before = await store.listSkills({
    installationId: INSTALLATION_ID,
    limit: 20,
    offset: 0,
  });
  assert.equal(before.total, 1);
  const beforeUpdatedAt = before.items[0].updatedAt;

  const latest = await store.getLatestSuccessfulIngestion(INSTALLATION_ID);
  assert.equal(latest?.ingestionHash, "same-hash");

  // Simulate idempotent sync branch: identical hash, so no replaceSkillSpecs call.
  const after = await store.listSkills({
    installationId: INSTALLATION_ID,
    limit: 20,
    offset: 0,
  });

  assert.equal(await store.countActiveSkills(INSTALLATION_ID), 1);
  assert.equal(after.total, 1);
  assert.equal(after.items[0].updatedAt, beforeUpdatedAt);
});
