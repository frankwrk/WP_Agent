import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../../src/server";

test("GET /api/v1/health returns ok", async () => {
  const app = await buildServer();

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "wp-agent-backend",
  });

  await app.close();
});
