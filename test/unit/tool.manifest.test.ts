import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRequiredReadTools,
  validateToolManifest,
} from "../../src/services/wp/tool.manifest";

test("validateToolManifest parses tool definitions", () => {
  const manifest = validateToolManifest({
    ok: true,
    data: {
      tools: [
        {
          name: "site.get_environment",
          description: "Get WP runtime environment",
          endpoint: "/wp-json/wp-agent/v1/site/environment",
          method: "GET",
          readOnly: true,
        },
      ],
    },
    error: null,
    meta: {},
  });

  assert.equal(manifest.ok, true);
  assert.equal(manifest.data.tools.length, 1);
  assert.equal(manifest.data.tools[0]?.name, "site.get_environment");
});

test("assertRequiredReadTools rejects missing M2 read tools", () => {
  const manifest = validateToolManifest({
    ok: true,
    data: {
      tools: [
        {
          name: "site.get_environment",
          description: "Get WP runtime environment",
          endpoint: "/wp-json/wp-agent/v1/site/environment",
          method: "GET",
          readOnly: true,
        },
      ],
    },
    error: null,
    meta: {},
  });

  assert.throws(() => assertRequiredReadTools(manifest), {
    message: /Required read tool is missing/,
  });
});
