import assert from "node:assert/strict";
import test from "node:test";
import { getUtcDayStartIso } from "../../src/services/llm/usage.ledger";

test("getUtcDayStartIso normalizes to UTC midnight", () => {
  const iso = getUtcDayStartIso(new Date("2026-02-16T18:22:11.999Z"));
  assert.equal(iso, "2026-02-16T00:00:00.000Z");
});
